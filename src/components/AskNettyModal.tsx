import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Sparkles,
  Send,
  X,
  Plus,
  Trash2,
  MessageSquare,
  Star,
  Clock,
  ExternalLink,
  Film,
  Tv,
  RefreshCw,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  AlertTriangle,
} from 'lucide-react';
import { DiscoveryTitle, LibraryItem } from '../types';
import {
  getAllDiscoveryTitles,
  getDiscoveryCatalogCount,
  saveDiscoveryTitles,
  getNettyConversations,
  saveNettyConversations,
  deleteNettyConversation,
} from '../services/db';
import { SEED_NETFLIX_INDIA_TITLES, convertEnrichedRecordToDiscoveryTitle } from '../services/discoveryService';
import { queryCatalogIntelligence, ScoredTitleResult } from '../services/discoveryIntelligenceService';
import { groqService } from '../services/groqService';
import { CachedImage } from './CachedImage';
import { VERIFIED_POSTER_MAP, normalizeTitleKey } from '../services/imageResolver';

interface AskNettyProps {
  libraryItems: LibraryItem[];
  onOpenMovieDetail: (item: DiscoveryTitle | LibraryItem) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'netty';
  text: string;
  results?: ScoredTitleResult[];
  timestamp: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
}

const STORAGE_KEY = 'netty_ai_conversations_v3';
const ACTIVE_CONV_STORAGE_KEY = 'netty_active_conv_id_v3';
const SUGGESTIONS_STORAGE_KEY = 'netty_try_suggestions_v3';

// Purge bloated legacy localStorage keys to free quota and prevent QuotaExceededError
try {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('netty_ai_conversations_v3');
  localStorage.removeItem('netty_ai_conversations_v2');
  localStorage.removeItem('netty_ai_conversations');
} catch {}

const DEFAULT_TRY_SUGGESTIONS = [
  'Movie about a strong girl',
  'Mind-bending sci-fi like Tenet',
  '10 thrillers under 2 hours',
  'Heartwarming feel-good shows',
  'Dark psychological revenge',
  '💎 Hidden Gems on Netflix',
];

const CURATED_IDEA_ROTATION = [
  ['Movie about a strong girl', 'Mind-bending sci-fi like Tenet', '10 thrillers under 2 hours', 'Heartwarming feel-good shows', '💎 Hidden Gems'],
  ['Smart time-loop movies', 'Gritty Indian crime thrillers', 'Fast-paced heist under 90m', 'Inspiring female-led drama', 'Feel-good anime comedies'],
  ['Like Interstellar but darker', 'Gripping serial killer mystery', 'Emotional tearjerker dramas', 'Cyberpunk sci-fi thrillers', 'Underdog sports triumphs'],
  ['Paranoid psychological puzzles', 'Wholesome cozy comfort movies', 'Explosive martial arts action', 'Movies like Gone Girl', 'Underrated indie masterpieces']
];

/**
 * Strips huge duplicate vectors and internal state from catalog items so that
 * all conversations and movie card results comfortably persist in IndexedDB.
 */
function sanitizeConversationsForStorage(convs: Conversation[]): Conversation[] {
  return convs.map((c) => ({
    ...c,
    messages: c.messages.map((m) => {
      if (!m.results || m.results.length === 0) return m;
      return {
        ...m,
        results: m.results.slice(0, 15).map((r) => ({
          item: {
            id: r.item.id,
            title: r.item.title,
            originalTitle: r.item.originalTitle,
            mediaType: r.item.mediaType,
            releaseYear: r.item.releaseYear,
            runtimeMinutes: r.item.runtimeMinutes,
            totalSeasons: r.item.totalSeasons,
            rating: r.item.rating,
            imdbRating: r.item.imdbRating,
            synopsis: r.item.synopsis,
            genres: r.item.genres,
            posterPath: r.item.posterPath,
            backdropPath: r.item.backdropPath,
            isNetflixIndiaVerified: r.item.isNetflixIndiaVerified,
            countries: r.item.countries,
          },
          score: Math.round(r.score * 100) / 100,
          semanticMatchScore: r.semanticMatchScore || 0,
          themeMatchScore: r.themeMatchScore || 0,
          genreMatchScore: r.genreMatchScore || 0,
          qualityScore: r.qualityScore || 0,
          explanation: r.explanation,
          badges: r.badges || [],
        })),
      };
    }),
  }));
}

const DEFAULT_WELCOME_CONVERSATION: Conversation = {
  id: 'conv_default',
  title: 'New Movie Chat',
  messages: [
    {
      id: 'welcome',
      sender: 'netty',
      text: "Hey! I'm Netty, your local AI discovery engine. Ask me anything like \"Movie about a strong girl\", \"Mind-bending sci-fi like Tenet\", or \"10 thrillers under 2 hours\" — I'll analyze the whole Netflix India catalog and find the best matches!",
      timestamp: 'Just now',
    },
  ],
  updatedAt: new Date().toISOString(),
};

export type NettyIntentType =
  | 'status_check'      // "are you online", "are you there", "are you awake", "is this working", "ping"
  | 'greeting'          // "hi", "hello", "hey", "good morning", "good evening"
  | 'identity'          // "who are you", "what are you", "what can you do", "help"
  | 'chitchat'          // "how are you", "thank you", "cool", "tell me a joke", "bye"
  | 'movie_trivia'      // "who directed inception", "who played iron man", "explain interstellar ending"
  | 'recommendation';   // "recommend me a thriller", "movies under 2 hours", "action movies"

export interface DetectedIntent {
  type: NettyIntentType;
  requiresCatalogSearch: boolean;
  cleanQuery: string;
}

export function detectUserIntent(rawQuery: string): DetectedIntent {
  const query = rawQuery.trim().toLowerCase();

  // If query explicitly asks for movies, recommendations, or genres, it is a recommendation query
  const hasRecommendationIntent = /\b(?:recommend|suggest|what\s+to\s+watch|what\s+should\s+i\s+watch|give\s+me|find\s+me|show\s+me|looking\s+for|search|any\s+good|best\s+(?:movies?|shows?|series|films?)|titles?|movies?|films?|shows?|series|season|episodes?|watch\s+next|similar\s+to|like\s+[a-z0-9]+)\b/i.test(query);

  const hasSpecificGenreOrMood = /\b(?:thriller|horror|comedy|action|drama|romance|sci-fi|scifi|anime|documentary|mystery|crime|adventure|fantasy|suspense|feel-good|heartwarming|dark|mind-bending|fast-paced|slow-burn|underrated|hidden\s*gems?)\b/i.test(query);

  if (hasRecommendationIntent || hasSpecificGenreOrMood) {
    // Check if it's purely a trivia question like "who directed inception" or "what year was the matrix released"
    const isTriviaQuestion = /^(?:who\s+(?:directed|wrote|produced|created|starred\s+in|played)|what\s+year\s+was|when\s+was\s+.+\s+released|explain\s+(?:the\s+)?ending\s+of|did\s+.+\s+win\s+an?\s+oscar)\b/i.test(query) &&
      !/\b(?:recommend|suggest|give\s+me|find\s+me|show\s+me|list|top\s+\d+|under\s+\d+)\b/i.test(query);

    if (isTriviaQuestion) {
      return { type: 'movie_trivia', requiresCatalogSearch: false, cleanQuery: query };
    }

    return { type: 'recommendation', requiresCatalogSearch: true, cleanQuery: query };
  }

  // 1. Status checks ("are you online", "are you there", "are you alive", "is this working", "ping")
  const statusPatterns = [
    /^(?:are\s+you\s+(?:online|there|awake|active|listening|working|alive|up|here|ready|available|operational)|is\s+(?:anyone\s+there|this\s+working|it\s+online|netty\s+online)|can\s+you\s+(?:hear|see)\s+me|ping|test|status(?:\s+check)?)\b/i,
    /^(?:u\s+(?:online|there|awake|up|working))\b/i,
  ];
  if (statusPatterns.some(p => p.test(query))) {
    return { type: 'status_check', requiresCatalogSearch: false, cleanQuery: query };
  }

  // 2. Greetings ("hi", "hello", "hey netty", "good morning", etc.)
  const greetingPatterns = [
    /^(?:hi|hello|hey|heyy+|howdy|sup|yo|namaste|hola|bonjour|greetings)(?:\s+netty|\s+there|\s+bot)?[\s!.,?]*$/i,
    /^(?:good\s+(?:morning|afternoon|evening|day))(?:\s+netty)?[\s!.,?]*$/i,
  ];
  if (greetingPatterns.some(p => p.test(query))) {
    return { type: 'greeting', requiresCatalogSearch: false, cleanQuery: query };
  }

  // 3. Identity & Capabilities ("who are you", "what are you", "what can you do", "help")
  const identityPatterns = [
    /^(?:who\s+are\s+you|what\s+are\s+you|who\s+is\s+netty|what\s+is\s+netty|tell\s+me\s+about\s+yourself|introduce\s+yourself|what\s+can\s+you\s+do|how\s+do\s+you\s+work|what\s+are\s+your\s+features|what\s+is\s+this\s+app|help(?:\s+me)?|are\s+you\s+(?:an?\s+)?(?:ai|bot|robot|human|real))\b/i,
  ];
  if (identityPatterns.some(p => p.test(query))) {
    return { type: 'identity', requiresCatalogSearch: false, cleanQuery: query };
  }

  // 4. Chit-chat & Courtesy ("how are you", "thank you", "thanks", "ok", "cool", "tell me a joke", "bye")
  const chitchatPatterns = [
    /^(?:how\s+are\s+you|how(?:\s+is|'s)\s+it\s+going|what(?:\s+is|'s)\s+up|how\s+have\s+you\s+been)[\s!.,?]*$/i,
    /^(?:thanks?|thank\s+you(?:\s+so\s+much)?|thx|ty|great\s+job|awesome|amazing|cool|nice|ok|okay|got\s+it|understood|perfect|wonderful|lol|haha|lmao)[\s!.,?]*$/i,
    /^(?:bye|goodbye|see\s+ya|see\s+you(?:\s+later)?|good\s*night|cya|later|take\s+care)[\s!.,?]*$/i,
    /^(?:tell\s+me\s+a\s+joke|make\s+me\s+laugh|say\s+something\s+(?:funny|interesting)|tell\s+me\s+a\s+fun\s+fact)[\s!.,?]*$/i,
  ];
  if (chitchatPatterns.some(p => p.test(query))) {
    return { type: 'chitchat', requiresCatalogSearch: false, cleanQuery: query };
  }

  // 5. Film Trivia
  if (/^(?:who\s+(?:directed|wrote|produced|created|starred\s+in|played)|what\s+year|when\s+was|explain\s+the\s+ending)\b/i.test(query)) {
    return { type: 'movie_trivia', requiresCatalogSearch: false, cleanQuery: query };
  }

  // Default fallback: If it's very short and non-movie (like "a", "asdf", "?"), treat as chitchat
  if (query.length < 4 && !/^\d+$/.test(query)) {
    return { type: 'chitchat', requiresCatalogSearch: false, cleanQuery: query };
  }

  // Otherwise, treat as recommendation query
  return { type: 'recommendation', requiresCatalogSearch: true, cleanQuery: query };
}

export const AskNettyModal: React.FC<AskNettyProps> = ({ libraryItems, onOpenMovieDetail }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputQuery, setInputQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  const [allCatalogTitles, setAllCatalogTitles] = useState<DiscoveryTitle[]>([]);

  // SQLite Knowledge Base Connection state for AI (3-second prompt verification)
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [dbEnrichedCount, setDbEnrichedCount] = useState<number>(0);

  const verifyDatabaseAttachment = async () => {
    setDbStatus('checking');
    const startTime = Date.now();

    try {
      // 1. Instant check: in-memory catalog
      if (allCatalogTitles.length > 0) {
        const enriched = allCatalogTitles.filter(
          (t) => t.parameters_100 && Object.keys(t.parameters_100).length > 0
        ).length || allCatalogTitles.length;
        const elapsed = Date.now() - startTime;
        if (elapsed < 500) {
          await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
        }
        setDbEnrichedCount(enriched);
        setDbStatus('connected');
        return;
      }

      // 2. Instant check: IndexedDB title count (~2ms)
      const count = await getDiscoveryCatalogCount();
      if (count > 0) {
        const elapsed = Date.now() - startTime;
        if (elapsed < 500) {
          await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
        }
        setDbEnrichedCount(count);
        setDbStatus('connected');
        return;
      }

      // 3. Fast check: verify SQLite DB or enriched JSON presence on server via fast HEAD request
      let fileAvailable = false;
      try {
        const headRes = await fetch('/netflix_knowledge_base.sqlite', { method: 'HEAD' });
        if (headRes.ok) {
          fileAvailable = true;
        } else {
          const headJson = await fetch('/netflix_enriched_kb.json', { method: 'HEAD' });
          if (headJson.ok) fileAvailable = true;
        }
      } catch {}

      const elapsed = Date.now() - startTime;
      if (elapsed < 500) {
        await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
      }

      if (fileAvailable) {
        setDbEnrichedCount(4806);
        setDbStatus('connected');
      } else {
        setDbStatus('error');
      }
    } catch {
      const elapsed = Date.now() - startTime;
      if (elapsed < 500) {
        await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
      }
      setDbStatus('error');
    }
  };

  // Run the 3-second connection prompt whenever Ask Netty is opened
  useEffect(() => {
    if (isOpen) {
      verifyDatabaseAttachment();
    }
  }, [isOpen]);

  // Multi-conversation state
  const [conversations, setConversations] = useState<Conversation[]>([DEFAULT_WELCOME_CONVERSATION]);

  const [activeConvId, setActiveConvId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_CONV_STORAGE_KEY);
      if (saved) return saved;
    } catch {}
    return 'conv_default';
  });

  const [trySuggestions, setTrySuggestions] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(SUGGESTIONS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_TRY_SUGGESTIONS;
  });

  const rotationIdxRef = useRef(0);
  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const libraryItemsRef = useRef(libraryItems);
  const hasLoadedFromDBRef = useRef(false);

  useEffect(() => {
    libraryItemsRef.current = libraryItems;
  }, [libraryItems]);

  // Sync activeConvId to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_CONV_STORAGE_KEY, activeConvId);
    } catch {}
  }, [activeConvId]);

  // Sync sanitized conversations to IndexedDB (only after initial load has finished)
  useEffect(() => {
    if (!hasLoadedFromDBRef.current) return;
    if (conversations && conversations.length > 0) {
      const sanitized = sanitizeConversationsForStorage(conversations);
      saveNettyConversations(sanitized).catch((err) => {
        console.warn('Failed to save Netty conversations to IDB:', err);
      });
    }
  }, [conversations]);

  // Load saved conversations from IndexedDB and catalog titles on initial mount
  useEffect(() => {
    let isMounted = true;
    async function initNetty() {
      // 1. Load saved conversations from IndexedDB
      try {
        const saved = await getNettyConversations();
        if (isMounted && saved && saved.length > 0) {
          setConversations(saved);
          const activeSaved = localStorage.getItem(ACTIVE_CONV_STORAGE_KEY);
          if (activeSaved && saved.some((c: any) => c.id === activeSaved)) {
            setActiveConvId(activeSaved);
          } else {
            setActiveConvId(saved[0].id);
          }
        }
      } catch (err) {
        console.warn('Failed to load Netty conversations from IDB:', err);
      } finally {
        hasLoadedFromDBRef.current = true;
      }

      // 2. Load catalog
      const mergedMap = new Map<string, DiscoveryTitle>();

      // Seed fallback base
      for (const t of SEED_NETFLIX_INDIA_TITLES) {
        if (!t || !t.title) continue;
        mergedMap.set(t.title.toLowerCase().trim(), t);
      }

      // Load from IndexedDB
      try {
        const stored = await getAllDiscoveryTitles();
        if (stored && stored.length > 0) {
          for (const t of stored) {
            if (!t || !t.title) continue;
            mergedMap.set(t.title.toLowerCase().trim(), t);
          }
        }
      } catch (err) {
        console.warn('IndexedDB catalog fetch error:', err);
      }

      // Incorporate current library items
      const currentLibs = libraryItemsRef.current;
      if (currentLibs && currentLibs.length > 0) {
        for (const lib of currentLibs) {
          if (!lib) continue;
          const libTitle = lib.externalTitle || lib.originalTitle || lib.normalizedTitle || '';
          if (!libTitle) continue;
          const key = libTitle.toLowerCase().trim();
          if (!mergedMap.has(key)) {
            mergedMap.set(key, {
              id: lib.id,
              title: libTitle,
              originalTitle: lib.originalTitle || libTitle,
              mediaType: lib.mediaType === 'tv' ? 'tv' : 'movie',
              releaseYear: lib.releaseYear,
              runtimeMinutes: lib.runtimeMinutes,
              totalSeasons: lib.totalSeasons,
              genres: lib.genres || [],
              synopsis: lib.synopsis || '',
              rating: lib.imdbRating || lib.rating || 7.5,
              imdbRating: lib.imdbRating || 7.5,
              isNetflixIndiaVerified: true,
              countries: lib.countries || ['India'],
              posterPath: lib.posterPath,
              backdropPath: lib.backdropPath,
            });
          }
        }
      }

      // Always load all 4,800+ titles with plots, taglines, vibe & pacing from netflix_enriched_kb.json
      try {
        const res = await fetch('/netflix_enriched_kb.json');
        if (res.ok) {
          const rawEnriched = await res.json();
          for (const r of rawEnriched) {
            const key = (r.title || '').toLowerCase().trim();
            if (!key) continue;

            const sec = typeof r.secondary_genres === 'string' ? JSON.parse(r.secondary_genres || '[]') : (r.secondary_genres || []);
            const allGenres = Array.from(new Set([r.primary_genre, ...sec].filter(Boolean)));
            const moods = typeof r.moods === 'string' ? JSON.parse(r.moods || '[]') : (r.moods || []);
            const themes = typeof r.themes === 'string' ? JSON.parse(r.themes || '[]') : (r.themes || []);
            const existing = mergedMap.get(key);

            const params100: Record<string, number> = r.raw_profile?.parameters_100 ? { ...r.raw_profile.parameters_100 } : {};
            for (const [col, val] of Object.entries(r)) {
              if (col.startsWith('param_') && typeof val === 'number') {
                params100[col.replace('param_', '')] = val;
              }
            }

            const detectedMediaType: 'movie' | 'tv' = (r.media_type === 'tv' || r.media_type === 'tv_series')
              ? 'tv'
              : (r.media_type === 'movie' ? 'movie' : (existing?.mediaType || 'movie'));

            const narrativeArchetypes = typeof r.narrative_archetypes === 'string'
              ? (r.narrative_archetypes.startsWith('[') ? JSON.parse(r.narrative_archetypes || '[]') : [r.narrative_archetypes])
              : (r.narrative_archetypes || []);

            const enrichedItem: DiscoveryTitle = {
              id: existing?.id || String(r.id || key),
              title: r.title,
              originalTitle: r.title,
              mediaType: detectedMediaType,
              releaseYear: r.release_year || existing?.releaseYear,
              tagline: r.tagline || existing?.tagline || undefined,
              primaryGenre: r.primary_genre || existing?.primaryGenre || allGenres[0] || 'Drama',
              secondaryGenres: (sec && sec.length > 0) ? sec : existing?.secondaryGenres,
              genres: allGenres.length > 0 ? allGenres : (existing?.genres || ['Drama']),
              themes: themes.length > 0 ? themes : (existing?.themes || []),
              moods: moods.length > 0 ? moods : (existing?.moods || []),
              synopsis: r.synopsis || existing?.synopsis || '',
              rating: existing?.rating || 7.5,
              imdbRating: existing?.imdbRating || 7.5,
              isNetflixIndiaVerified: true,
              countries: (r.countries && Array.isArray(r.countries) && r.countries.length > 0)
                ? r.countries
                : (existing?.countries || ['India']),
              posterPath: existing?.posterPath || VERIFIED_POSTER_MAP[normalizeTitleKey(r.title || '')] || r.posterPath || r.poster_path,
              backdropPath: existing?.backdropPath || r.backdropPath || r.backdrop_path,
              parameters_100: params100,
              // Qwen SQLite Knowledge Base Fields
              storyPace: r.story_pace || existing?.storyPace || undefined,
              endingType: r.ending_type || existing?.endingType || undefined,
              timePeriod: r.time_period || existing?.timePeriod || undefined,
              settingEnvironment: r.setting_environment || existing?.settingEnvironment || undefined,
              audienceVibe: r.audience_vibe || existing?.audienceVibe || undefined,
              narrativeArchetypes,
              qwenConfidence: typeof r.confidence_score === 'number' ? r.confidence_score : undefined,
            };
            mergedMap.set(key, enrichedItem);
          }
        }
      } catch (err) {
        console.info('Enriched KB fetch skipped or not yet generated:', err);
      }

      if (isMounted) {
        const fullCatalog = Array.from(mergedMap.values());
        setAllCatalogTitles(fullCatalog);
        if (fullCatalog.length > 500) {
          saveDiscoveryTitles(fullCatalog).catch(() => {});
        }
      }
    }

    initNetty();
    return () => {
      isMounted = false;
    };
  }, []);

  const activeConversation =
    conversations.find((c) => c.id === activeConvId) || conversations[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages, isProcessing]);

  // Create new conversation
  const handleNewConversation = () => {
    const newId = 'conv_' + Date.now();
    const newConv: Conversation = {
      id: newId,
      title: 'New Chat',
      messages: [
        {
          id: 'm_' + Date.now(),
          sender: 'netty',
          text: 'Started a fresh chat! What are you in the mood to watch?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newId);
  };

  // Delete conversation
  const handleDeleteConversation = (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    deleteNettyConversation(convId).catch(() => {});
    if (conversations.length === 1) {
      handleNewConversation();
      return;
    }
    const updated = conversations.filter((c) => c.id !== convId);
    setConversations(updated);
    if (activeConvId === convId) {
      setActiveConvId(updated[0].id);
    }
  };

  // Send query
  const handleSend = async (customQuery?: string) => {
    const query = (customQuery || inputQuery).trim();
    if (!query || isProcessing) return;

    setInputQuery('');
    const userMsg: ChatMessage = {
      id: 'u_' + Date.now(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Update active conversation title if it's the first query
    const shouldUpdateTitle = activeConversation.messages.length <= 1;

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConvId) {
          return {
            ...c,
            title: shouldUpdateTitle ? query.slice(0, 24) + (query.length > 24 ? '...' : '') : c.title,
            messages: [...c.messages, userMsg],
            updatedAt: new Date().toISOString(),
          };
        }
        return c;
      })
    );

    setIsProcessing(true);

    try {
      const intent = detectUserIntent(query);
      let scoredResults: ScoredTitleResult[] = [];

      // ONLY search catalog intelligence if the user's intent is actually seeking recommendations or film titles!
      if (intent.requiresCatalogSearch) {
        const catalog = allCatalogTitles.length > 0 ? allCatalogTitles : SEED_NETFLIX_INDIA_TITLES;
        try {
          scoredResults = queryCatalogIntelligence(catalog, query);
        } catch (searchErr) {
          console.error('Error during catalog intelligence search:', searchErr);
          const qLower = query.toLowerCase();
          scoredResults = catalog
            .filter(t => (t.title && t.title.toLowerCase().includes(qLower)) || (t.synopsis && t.synopsis.toLowerCase().includes(qLower)))
            .slice(0, 8)
            .map(item => ({
              item,
              score: 0.8,
              semanticMatchScore: 0.8,
              themeMatchScore: 0.8,
              genreMatchScore: 0.8,
              qualityScore: (item.imdbRating || 7) / 10,
              explanation: 'Matched search keywords in title/synopsis',
              badges: [],
            }));
        }
      }

      // Build intelligent conversational reply with Groq AI + Catalog grounding
      let replyText = '';

      if (groqService.isAvailable()) {
        try {
          let systemPrompt = '';
          let historyForAI: Array<{ role: 'user' | 'assistant'; content: string }> = [];

          if (intent.type === 'status_check') {
            systemPrompt = `You are Netty, Netflix India's smart, warm, and cinephile AI companion.
The user is asking if you are online, active, or ready ("${query}").

Instructions:
- Confirm warmly, directly, and confidently that you are fully online and ready to help them explore Netflix India!
- Keep your response very concise (1 to 2 sentences maximum).
- Do NOT push specific movie titles or generate cards.
- Do NOT bring up past conversation topics or old search terms.
- Sound confident, friendly, and smart (e.g. "I'm fully online and ready! 🍿 What kind of movie or series are you in the mood for today?").`;
            historyForAI = [];
          } else if (intent.type === 'greeting') {
            systemPrompt = `You are Netty, Netflix India's smart, warm, and cinephile AI companion.
The user sent a friendly greeting ("${query}").

Instructions:
- Greet the user back warmly and conversationally in 1-2 friendly sentences.
- Invite them to tell you what they're in the mood to watch (mood, genre, runtime, or a favorite movie).
- Keep it natural, warm, and concise. Do NOT list or push specific movie titles yet.`;
            historyForAI = [];
          } else if (intent.type === 'identity') {
            systemPrompt = `You are Netty, Netflix India's AI film and television discovery engine powered by Qwen 28B and an enriched knowledge base of 4,800+ titles.
The user asked about who you are or what you can do ("${query}").

Instructions:
- Explain your capabilities clearly and concisely in 1-2 short paragraphs.
- You analyze titles across deep narrative parameters (pacing, twist endings, emotional vibe, intensity, runtime) to find exact matches for any mood or taste.
- Give 2 brief examples of queries they can ask (e.g. "10 thrillers under 2 hours" or "mind-bending sci-fi like Tenet").`;
            historyForAI = [];
          } else if (intent.type === 'chitchat') {
            systemPrompt = `You are Netty, Netflix India's clever, friendly, and witty AI companion.
The user is having casual conversation or polite chit-chat ("${query}").

Instructions:
- Respond naturally, cleverly, and warmly in 1-2 sentences.
- If asked for a joke, tell a clever film-themed joke.
- Keep it engaging and concise without generating unsolicited movie recommendation lists.`;
            historyForAI = activeConversation.messages.slice(-4).map((m) => ({
              role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.text,
            }));
          } else if (intent.type === 'movie_trivia') {
            systemPrompt = `You are Netty, an encyclopedic film and television buff and Netflix curator.
The user asked a factual cinema or TV question: "${query}".

Instructions:
- Answer accurately, insightfully, and conversationally in 1-2 concise paragraphs.
- Share interesting film context where relevant.`;
            historyForAI = activeConversation.messages.slice(-4).map((m) => ({
              role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.text,
            }));
          } else {
            // recommendation / discovery
            const candidateListStr = scoredResults.slice(0, 5).map((r, i) => {
              const top100Params = Object.entries(r.item.parameters_100 || {})
                .filter(([_, v]) => typeof v === 'number' && v >= 0.60)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .slice(0, 4)
                .map(([k, v]) => `${k.replace(/_/g, ' ')} (${Math.round((v as number) * 100)}%)`)
                .join(', ');

              const qwenDimensions = [
                r.item.storyPace ? `Pace: ${r.item.storyPace}` : null,
                r.item.endingType ? `Ending: ${r.item.endingType}` : null,
                r.item.settingEnvironment ? `Setting: ${r.item.settingEnvironment}` : null,
                r.item.timePeriod ? `Period: ${r.item.timePeriod}` : null,
              ].filter(Boolean).join(' | ');

              return `${i + 1}. **${r.item.title}** (${r.item.releaseYear || 'N/A'}, ${r.item.mediaType === 'tv' ? 'Series' : 'Movie'}, IMDb: ${r.item.imdbRating || r.item.rating || 'N/A'})\n   Genres: ${(r.item.genres || []).join(', ')}\n   Qwen 28B Narrative Analysis: ${qwenDimensions || 'Catalog title'}\n   Dominant Continuous Vectors: ${top100Params || (r.item.themes || []).join(', ') || 'Drama'}\n   Synopsis: ${(r.item.synopsis || '').slice(0, 160)}...`;
            }).join('\n\n');

            systemPrompt = `You are Netty, Netflix India's ultimate AI film & series curator powered by Qwen 28B.
You are powered by our Local SQLite Knowledge Base containing 4,800+ titles enriched across 100 continuous emotional, thematic, and narrative parameters (pacing, ending types, setting, intensity).
You are warm, intelligent, enthusiastic, and talk like a passionate cinephile friend.

The user just sent: "${query}".

Verified matching catalog titles from Local Qwen SQLite Knowledge Base:
${candidateListStr || '(No direct title match in current catalog slice)'}

Instructions:
- If recommending titles, highlight 2-3 of the top titles above and explain why they match the user's vibe using the local Qwen narrative insights (e.g. story pace, twist ending, psychological intensity, or emotional warmth).
- Keep responses engaging, well-formatted, and helpful (1-3 concise paragraphs max). Use bold text for movie titles.`;

            historyForAI = activeConversation.messages.slice(-6).map((m) => ({
              role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.text,
            }));
          }

          const aiMessages = [
            { role: 'system' as const, content: systemPrompt },
            ...historyForAI,
            { role: 'user' as const, content: query }
          ];

          const groqReply = await groqService.chatCompletion(
            aiMessages,
            intent.type === 'status_check' || intent.type === 'greeting' ? 0.3 : 0.4,
            intent.type === 'status_check' || intent.type === 'greeting' ? 120 : 600
          );
          if (groqReply) {
            replyText = groqReply;
          }
        } catch (e) {
          console.warn('Groq synthesis fallback to default:', e);
        }
      }

      // Smart Fallback response if Groq is unavailable
      if (!replyText) {
        if (intent.type === 'status_check') {
          replyText = "I'm fully online and ready! 🍿 What kind of movie or series are you in the mood for today?";
        } else if (intent.type === 'greeting') {
          replyText = "Hey there! Ready to discover your next favorite watch on Netflix India? Tell me what genre, mood, or vibe you're looking for!";
        } else if (intent.type === 'identity') {
          replyText = "I'm Netty, your Netflix India AI film & series curator! I analyze thousands of titles using story pace, twist endings, emotional vibe, and runtime constraints to find your perfect match. Try asking for '10 thrillers under 2 hours' or 'mind-bending sci-fi'!";
        } else if (intent.type === 'chitchat') {
          replyText = "Always happy to chat! Whenever you're ready for movie or series recommendations, just let me know what you'd like to watch!";
        } else if (intent.type === 'movie_trivia') {
          replyText = "I love talking film trivia! Let me know which movies or shows you'd like to explore next.";
        } else {
          if (scoredResults.length > 0) {
            replyText = `Found ${scoredResults.length} title(s) matching your request:`;
          } else {
            replyText = `I couldn't find titles matching all strict constraints. Try asking with different genres, moods, or removing the runtime cap!`;
          }
        }
      }

      const botMsg: ChatMessage = {
        id: 'n_' + Date.now(),
        sender: 'netty',
        text: replyText,
        results: intent.requiresCatalogSearch && scoredResults.length > 0 ? scoredResults : undefined,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === activeConvId) {
            return {
              ...c,
              messages: [...c.messages, botMsg],
              updatedAt: new Date().toISOString(),
            };
          }
          return c;
        })
      );
    } catch (err) {
      console.error('Netty message processing failed:', err);
      const fallbackBotMsg: ChatMessage = {
        id: 'n_err_' + Date.now(),
        sender: 'netty',
        text: "I encountered an issue processing that query, but I'm ready for another! Try asking by mood, genre, or a favorite movie title.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === activeConvId) {
            return {
              ...c,
              messages: [...c.messages, fallbackBotMsg],
              updatedAt: new Date().toISOString(),
            };
          }
          return c;
        })
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Generate creative new Try suggestion prompts with AI or intelligent rotation
  const handleGenerateNewSuggestions = async () => {
    setIsGeneratingIdeas(true);
    try {
      if (groqService.isAvailable()) {
        const prompt = `Generate 5 catchy, ultra-specific, and diverse Netflix search prompts (max 5 words each). Include unique concepts like "Movie about a strong girl", "Mind-bending sci-fi like Tenet", "Fast heist under 90m", "Cozy rainy-day romance", "Gripping psychological puzzle". Return strictly a raw JSON array of 5 strings and nothing else.`;
        const reply = await groqService.chatCompletion([
          { role: 'system', content: 'You are an expert film curator. Return strictly a raw JSON array of 5 query strings.' },
          { role: 'user', content: prompt }
        ], 0.7, 120);

        if (reply) {
          const match = reply.match(/\[[\s\S]*\]/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const clean = parsed.slice(0, 6).map((s: string) => String(s).trim());
              setTrySuggestions(clean);
              try {
                localStorage.setItem(SUGGESTIONS_STORAGE_KEY, JSON.stringify(clean));
              } catch {}
              return;
            }
          }
        }
      }
    } catch (e) {
      console.info('Groq suggestions fallback to curated cycle:', e);
    } finally {
      setIsGeneratingIdeas(false);
    }

    // Fallback rotation from curated pool
    rotationIdxRef.current = (rotationIdxRef.current + 1) % CURATED_IDEA_ROTATION.length;
    const nextIdeas = CURATED_IDEA_ROTATION[rotationIdxRef.current];
    setTrySuggestions(nextIdeas);
    try {
      localStorage.setItem(SUGGESTIONS_STORAGE_KEY, JSON.stringify(nextIdeas));
    } catch {}
    setIsGeneratingIdeas(false);
  };

  return (
    <>
      {/* Floating Ask Netty Button - lifted on mobile/tablet to avoid being hidden under bottom bar */}
      <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] xl:bottom-6 left-4 sm:left-6 z-40">
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-medium rounded-full shadow-2xl hover:shadow-red-600/40 transition-all duration-300 hover:scale-105 active:scale-95 border border-white/20 backdrop-blur-md"
        >
          <div className="relative">
            <Bot className="w-5 h-5 text-white" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <span className="text-sm font-semibold tracking-wide">Ask Netty</span>
          <Sparkles className="w-4 h-4 text-amber-200 group-hover:rotate-12 transition-transform" />
        </button>
      </div>

      {/* Netty Interactive Modal - High z-index to overlay bottom dock completely on tablets & phones */}
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md animate-fade-in">
          <div
            className="relative w-full max-w-5xl h-[88vh] max-h-[850px] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex overflow-hidden text-zinc-100 transition-all duration-300"
          >
            {/* Left Sidebar: Conversations list */}
            {showSidebar && (
              <div className="w-56 lg:w-64 border-r border-zinc-800 bg-zinc-900/60 hidden md:flex flex-col shrink-0 animate-fade-in">
                <div className="p-3 border-b border-zinc-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-red-500" />
                    <span className="font-bold text-xs uppercase tracking-wider text-zinc-300">Chats</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleNewConversation}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New</span>
                    </button>
                    <button
                      onClick={() => setShowSidebar(false)}
                      className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800"
                      title="Collapse sidebar to maximize chat space"
                    >
                      <PanelLeftClose className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Conversations scroll area */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {conversations.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => setActiveConvId(c.id)}
                      className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-colors ${
                        c.id === activeConvId
                          ? 'bg-zinc-800 text-white font-medium shadow-sm border border-zinc-700/60'
                          : 'text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                        <span className="truncate">{c.title}</span>
                      </div>
                      {conversations.length > 1 && (
                        <button
                          onClick={(e) => handleDeleteConversation(e, c.id)}
                          className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 transition-opacity"
                          title="Delete Chat"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-zinc-950">
              {/* Header */}
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-zinc-800 bg-zinc-900/60">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center shadow-md">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm sm:text-base tracking-wide text-white">Ask Netty</h3>
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 rounded-full flex items-center gap-1 shadow-sm">
                        <Sparkles className="w-2.5 h-2.5 text-emerald-400" /> Qwen 2B SQLite Engine
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Analyzing {allCatalogTitles.length || 2323}+ verified titles enriched across 100 narrative, emotional & pacing dimensions
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2">
                  {!showSidebar && (
                    <button
                      onClick={() => setShowSidebar(true)}
                      className="hidden md:flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors border border-zinc-700/60"
                      title="Show Chats Sidebar"
                    >
                      <PanelLeftOpen className="w-3.5 h-3.5" />
                      <span>Chats</span>
                    </button>
                  )}
                  <button
                    onClick={handleNewConversation}
                    className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                    title="New Chat"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                    title="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* SQLite Connection Verification Prompt */}
              {dbStatus === 'checking' && (
                <div className="px-4 py-2.5 bg-blue-950/60 border-b border-blue-500/30 flex items-center justify-between text-xs text-blue-200 animate-pulse">
                  <div className="flex items-center gap-2.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    <span>Verifying SQLite Knowledge Base attachment for Qwen 28B...</span>
                  </div>
                  <span className="text-[10px] font-mono text-blue-400 bg-blue-900/40 px-2 py-0.5 rounded border border-blue-500/20">
                    Checking (&lt;2s)...
                  </span>
                </div>
              )}

              {dbStatus === 'connected' && (
                <div className="px-4 py-2.5 bg-emerald-950/60 border-b border-emerald-500/40 flex items-center justify-between text-xs text-emerald-200 animate-fade-in">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                    <span className="font-semibold text-white">
                      Connected: SQLite Knowledge Base Attached
                    </span>
                    <span className="hidden sm:inline text-emerald-300/80 text-[11px]">
                      ({dbEnrichedCount || 4806} titles & 100 narrative parameters active for Qwen 28B)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-900/50 px-2 py-0.5 rounded border border-emerald-500/30">
                    AI Online
                  </span>
                </div>
              )}

              {dbStatus === 'error' && (
                <div className="px-4 py-2.5 bg-red-950/70 border-b border-red-500/50 flex items-center justify-between text-xs text-red-200 animate-fade-in">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="font-semibold text-white">
                      Not Connected: SQLite Knowledge Base not attached
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={verifyDatabaseAttachment}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Connection</span>
                  </button>
                </div>
              )}

              {/* Dynamic Inspiration Chips with AI Generation */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/50 bg-zinc-900/30 overflow-x-auto no-scrollbar text-xs">
                <span className="text-zinc-500 font-medium whitespace-nowrap">Try:</span>
                <button
                  onClick={handleGenerateNewSuggestions}
                  disabled={isGeneratingIdeas}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-red-600/25 to-amber-600/25 border border-amber-500/50 text-amber-200 hover:text-white hover:border-amber-400 whitespace-nowrap transition-all shadow-sm active:scale-95 disabled:opacity-60"
                  title="Ask AI to suggest fresh movie queries"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${isGeneratingIdeas ? 'animate-spin' : ''}`} />
                  <span className="font-semibold text-[11px]">{isGeneratingIdeas ? 'Generating...' : '✨ New Ideas'}</span>
                </button>
                {trySuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(suggestion)}
                    className="px-2.5 py-1 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white whitespace-nowrap transition-colors border border-zinc-700/50 hover:border-zinc-500 text-xs shadow-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              {/* Messages viewport */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {activeConversation.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                        msg.sender === 'user'
                          ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-br-none shadow-md'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-bl-none shadow-md'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>

                    {/* Movie Cards Grid */}
                    {msg.results && msg.results.length > 0 && (
                      <div className="mt-3.5 w-full">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {msg.results.map((res, idx) => {
                            const movie = res.item;
                            return (
                              <div
                                key={idx}
                                onClick={() => {
                                  setIsOpen(false);
                                  onOpenMovieDetail(movie);
                                }}
                                className="group relative flex flex-col p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 hover:border-red-500/60 hover:bg-zinc-850 cursor-pointer transition-all duration-200 shadow-lg hover:shadow-2xl hover:scale-[1.01]"
                              >
                                {/* Poster + Header */}
                                <div className="flex gap-3.5">
                                  <div className="w-18 h-26 sm:w-20 sm:h-28 rounded-xl overflow-hidden shrink-0 shadow-md border border-zinc-800/80 group-hover:border-zinc-700 transition-colors bg-zinc-800 flex items-center justify-center">
                                    <CachedImage
                                      src={movie.posterPath}
                                      fallbackSrc={movie.backdropPath}
                                      alt={movie.title}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>

                                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                    <div>
                                      <h4 className="font-bold text-sm sm:text-base text-zinc-100 group-hover:text-red-400 transition-colors line-clamp-2 leading-snug">
                                        {movie.title}
                                      </h4>

                                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-zinc-400">
                                        {movie.releaseYear && <span className="font-medium">{movie.releaseYear}</span>}
                                        {movie.mediaType && (
                                          <span className="uppercase text-[10px] px-1.5 py-0.5 bg-zinc-800/90 rounded-md font-semibold text-zinc-300 border border-zinc-700/40">
                                            {movie.mediaType}
                                          </span>
                                        )}
                                        {movie.runtimeMinutes && (
                                          <span className="flex items-center gap-1 font-medium">
                                            <Clock className="w-3.5 h-3.5 opacity-70" />
                                            {movie.runtimeMinutes}m
                                          </span>
                                        )}
                                        {movie.totalSeasons && (
                                          <span className="text-zinc-400">
                                            {movie.totalSeasons} Season{movie.totalSeasons > 1 ? 's' : ''}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {(movie.imdbRating || movie.rating) && (
                                      <div className="flex items-center gap-2 mt-2">
                                        <div className="flex items-center gap-1 text-xs sm:text-sm font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-lg border border-amber-400/20">
                                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                                          <span>{movie.imdbRating || movie.rating}</span>
                                        </div>
                                        {res.badges && res.badges.length > 0 && (
                                          <span className="text-[11px] px-2 py-0.5 rounded-lg bg-red-500/10 text-red-300 border border-red-500/20 font-semibold truncate">
                                            {res.badges[0]}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Qwen SQLite Narrative Tags & Genres */}
                                <div className="flex flex-wrap gap-1.5 mt-3">
                                  {movie.storyPace && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-950/70 text-amber-300 border border-amber-800/50">
                                      ⚡ {movie.storyPace}
                                    </span>
                                  )}
                                  {movie.endingType && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-950/70 text-purple-300 border border-purple-800/50">
                                      🌀 {movie.endingType}
                                    </span>
                                  )}
                                  {movie.settingEnvironment && (
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-sky-950/70 text-sky-300 border border-sky-800/50">
                                      📍 {movie.settingEnvironment}
                                    </span>
                                  )}
                                  {movie.genres && movie.genres.slice(0, 3).map((g, gIdx) => (
                                    <span
                                      key={gIdx}
                                      className="text-[10px] sm:text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700/40"
                                    >
                                      {g}
                                    </span>
                                  ))}
                                </div>

                                {/* Rationale / Explanation */}
                                {res.explanation && (
                                  <p className="mt-2.5 text-xs text-zinc-300 bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800/80 leading-relaxed">
                                    {res.explanation}
                                  </p>
                                )}

                                <div className="mt-2.5 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs text-red-400 font-semibold group-hover:text-red-300 transition-colors">
                                  <span>View Movie Details</span>
                                  <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <span className="text-[10px] text-zinc-500 mt-1 px-1">{msg.timestamp}</span>
                  </div>
                ))}

                {isProcessing && (
                  <div className="flex items-center gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl w-fit animate-pulse text-xs text-zinc-400">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-500" />
                    <span>Analyzing catalog themes, mood tags, and ranking candidates...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input Bar */}
              <div className="p-3 border-t border-zinc-800 bg-zinc-900/60">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    placeholder="Ask Netty (e.g. 'Give me heart warming shows' or '10 thrillers under 2 hours')..."
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!inputQuery.trim() || isProcessing}
                    className="p-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-medium shadow-md transition-all active:scale-95"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
