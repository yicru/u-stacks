# System Utilities (Darwin/macOS)

## Git Commands
- `git status` - Check repository status
- `git add .` - Stage all changes
- `git commit -m "message"` - Commit changes
- `git push` - Push to remote
- `git pull` - Pull from remote
- `git branch` - List branches
- `git checkout -b branch-name` - Create new branch

## File System
- `ls` - List files (use `-la` for hidden files)
- `cd` - Change directory
- `pwd` - Print working directory
- `mkdir` - Create directory
- `rm` - Remove file (`-rf` for directories)
- `cp` - Copy files
- `mv` - Move/rename files

## Search and Find
- `find . -name "*.ts"` - Find files by pattern
- `grep -r "pattern" .` - Search in files (use ripgrep `rg` if available)
- `which command` - Find command location

## Process Management
- `ps aux | grep node` - Find Node.js processes
- `kill -9 PID` - Force kill process
- `lsof -i :3000` - Find process using port 3000

## npm/Node.js
- `npm list` - List installed packages
- `npm outdated` - Check for outdated packages
- `npm update` - Update packages
- `npx` - Execute package binaries

## macOS Specific
- `open .` - Open current directory in Finder
- `pbcopy < file` - Copy file contents to clipboard
- `pbpaste > file` - Paste clipboard to file