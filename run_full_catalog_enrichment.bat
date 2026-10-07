@echo off
title Netflix India 100-Parameter Enrichment Pipeline (GTX 1650 GPU)

echo ======================================================================
echo    NETFLIX INDIA 4800+ TITLES 100-PARAMETER ENRICHMENT PIPELINE
echo               GPU: NVIDIA GeForce GTX 1650
echo               Python Environment: E:\ai\deviai
echo ======================================================================
echo.

cd /d "%~dp0"

echo [1/3] Checking Catalog Data...
if not exist "data\netflix_india_all_titles.json" (
    echo Fetching complete Netflix India catalog...
    "E:\ai\deviai\Scripts\python.exe" scripts\fetch_full_catalog.py
)

echo.
echo [2/3] Running 100-Parameter GPU Pipeline...
echo Automatic checkpointing to SQLite after every title.
echo Press Ctrl+C at any time to pause.
echo.

"E:\ai\deviai\Scripts\python.exe" -m scripts.enrichment.pipeline --all --delay 0.35

echo.
echo ======================================================================
echo             ENRICHMENT RUN FINISHED OR PAUSED
echo   XLSX: scripts\enrichment\netflix_knowledge_base.xlsx
echo   JSON: scripts\enrichment\netflix_enriched_kb.json
echo   SQLITE: scripts\enrichment\netflix_knowledge_base.sqlite
echo ======================================================================
echo.
pause
