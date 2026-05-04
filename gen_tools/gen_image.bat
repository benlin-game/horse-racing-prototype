@echo off
set GAPI_KEY=AIzaSyC7umcmAdwscOCeBw8xeytqyABW_FJ9YiQ
set GAPI_MODEL=imagen-4.0-fast-generate-001
set GAPI_PROMPT=a golden trophy cup for horse racing arcade game, flat design icon, gold color, clean vector style
set GAPI_OUT=test_trophy.png
python "%~dp0gen_image.py"
pause
