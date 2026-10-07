"""Vector Engine & Arithmetic Module.
Handles:
1. Fast in-memory normalized dot-product search using NumPy BLAS.
2. Reference movie vector arithmetic:
   v_query = normalize(alpha * v_ref + beta * v_residual - gamma * v_negative)
3. Maximal Marginal Relevance (MMR) diversification.
4. User preference centroid tracking.
"""

from typing import List, Dict, Any, Tuple, Optional
import numpy as np
from .config import CONFIG


class VectorEngine:
    def __init__(self, embeddings: np.ndarray, id_to_index: Dict[Any, int], index_to_id: Dict[int, Any]):
        """
        Args:
            embeddings: 2D NumPy array of shape (N, 384), float32, L2-normalized.
            id_to_index: Map from title ID / key to row index in embeddings array.
            index_to_id: Map from row index back to title ID / key.
        """
        self.embeddings = embeddings.astype(np.float32)
        self.id_to_index = id_to_index
        self.index_to_id = index_to_id
        # Ensure vectors are normalized
        norms = np.linalg.norm(self.embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        self.embeddings = self.embeddings / norms

    @staticmethod
    def normalize_vector(v: np.ndarray) -> np.ndarray:
        norm = np.linalg.norm(v)
        if norm == 0:
            return v
        return v / norm

    def compose_reference_query_vector(
        self,
        ref_id: Any,
        residual_vector: Optional[np.ndarray],
        negative_vector: Optional[np.ndarray] = None,
        alpha: float = CONFIG["blend_weights"]["reference_alpha"],
        beta: float = CONFIG["blend_weights"]["residual_beta"],
        gamma: float = CONFIG["blend_weights"]["negative_gamma"],
    ) -> Optional[np.ndarray]:
        """
        Composes: query_vector = normalize(alpha * v_ref + beta * v_residual - gamma * v_negative)
        """
        if ref_id not in self.id_to_index:
            return residual_vector

        idx = self.id_to_index[ref_id]
        v_ref = self.embeddings[idx]

        if residual_vector is None:
            return v_ref

        blended = alpha * v_ref + beta * residual_vector
        if negative_vector is not None:
            blended -= gamma * negative_vector

        return self.normalize_vector(blended)

    def scan_top_k(
        self,
        query_vector: np.ndarray,
        candidate_indices: Optional[List[int]] = None,
        k: int = 100,
    ) -> List[Tuple[int, float]]:
        """
        Performs fast matrix multiplication to retrieve Top-K candidate indices with cosine scores.
        """
        if candidate_indices is not None and len(candidate_indices) > 0:
            sub_matrix = self.embeddings[candidate_indices]
            scores = np.dot(sub_matrix, query_vector)
            # Find top K indices within sub_matrix
            actual_k = min(k, len(candidate_indices))
            top_local_idx = np.argpartition(-scores, actual_k - 1)[:actual_k]
            # Sort top K
            top_local_sorted = top_local_idx[np.argsort(-scores[top_local_idx])]
            return [(candidate_indices[i], float(scores[i])) for i in top_local_sorted]
        else:
            scores = np.dot(self.embeddings, query_vector)
            actual_k = min(k, len(scores))
            top_idx = np.argpartition(-scores, actual_k - 1)[:actual_k]
            top_sorted = top_idx[np.argsort(-scores[top_idx])]
            return [(int(i), float(scores[i])) for i in top_sorted]

    def maximal_marginal_relevance(
        self,
        query_vector: np.ndarray,
        candidate_indices: List[int],
        top_n: int,
        lambda_param: float = CONFIG["diversity"]["mmr_lambda"],
    ) -> List[int]:
        """
        Selects top_n items using Maximal Marginal Relevance (MMR).
        Balances relevance to query with diversity among already selected items.
        """
        if not candidate_indices or top_n <= 0:
            return []

        if len(candidate_indices) <= top_n:
            return candidate_indices

        selected: List[int] = []
        candidates = list(candidate_indices)
        cand_embeddings = self.embeddings[candidates]  # Shape: (M, 384)
        sim_to_query = np.dot(cand_embeddings, query_vector)  # Shape: (M,)

        # Precompute candidate-to-candidate pairwise similarity matrix for fast lookup
        pairwise_sim = np.dot(cand_embeddings, cand_embeddings.T)

        for _ in range(top_n):
            if not candidates:
                break
            if not selected:
                # First item: pick highest similarity to query
                best_local_idx = int(np.argmax(sim_to_query))
                selected.append(candidates[best_local_idx])
                continue

            # Compute max similarity of each remaining candidate to any already selected item
            selected_local_indices = [candidates.index(s) for s in selected if s in candidates]
            max_sim_to_selected = np.max(pairwise_sim[:, selected_local_indices], axis=1)

            # MMR Score: lambda * sim(query, d) - (1 - lambda) * max(sim(d, selected))
            mmr_scores = lambda_param * sim_to_query - (1.0 - lambda_param) * max_sim_to_selected

            # Mask out already selected items
            for s_idx in selected_local_indices:
                mmr_scores[s_idx] = -float('inf')

            best_local_idx = int(np.argmax(mmr_scores))
            selected.append(candidates[best_local_idx])

        return selected
