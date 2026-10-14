@echo off
title EcoEngineers - Balanca
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-balanca.ps1" %*
pause
