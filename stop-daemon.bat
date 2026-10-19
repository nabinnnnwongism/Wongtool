@echo off
echo Stopping all Wong Micro-Daemon processes...
taskkill /F /FI "IMAGENAME eq node.exe" /FI "WINDOWTITLE eq Wong-MicroDaemon*" 2>nul
for /f "tokens=1,2" %%a in ('wmic process where "CommandLine like '%%wong-daemon%%'" get ProcessId^,Name 2^>nul') do (
  if "%%b" neq "ProcessId" (
    if "%%b" neq "" taskkill /F /PID %%b 2>nul
  )
)
echo Done.
