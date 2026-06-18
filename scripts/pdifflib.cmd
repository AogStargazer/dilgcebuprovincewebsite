@echo off
python "%~dp0pdifflib.py" %*
exit /b %errorlevel%
