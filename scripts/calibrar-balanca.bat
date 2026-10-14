@echo off
title EcoEngineers - Calibrar balanca
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0calibrar-balanca.ps1" %*
pause
