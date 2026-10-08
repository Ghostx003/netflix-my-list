@echo off
setlocal enabledelayedexpansion
title Netflix Recommender Engine - One-Click Launcher

echo ======================================================================
echo           NETFLIX ULTRA-LIGHTWEIGHT AI RECOMMENDER LAUNCHER
echo ======================================================================
echo.

cd /d "%~dp0"

echo [1/4] Running Automated Web Research & Knowledge Base Enrichment...
python -m scripts.enrichment.pipeline --limit 12
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Knowledge Base Enrichment encountered an issue.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/4] Running Python Recommender Benchmark and Verification...
python -m scripts.recommender.demo_verification
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Python demo script encountered an issue.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/4] Exporting Binary Vectors and Metadata to public/...
python -m scripts.recommender.export_embeddings
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Vector export failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [4/4] Compiling and Building Frontend Web Engine...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Frontend build failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ======================================================================
echo       ALL SYSTEMS OPERATIONAL! RECOMMENDER PIPELINE VERIFIED!
echo ======================================================================
echo.
pause
