#!/bin/sh
set -e

echo "copy_views.sh: Starting EJS file copy process"
echo "PWD: $(pwd)"
echo "USER: $(whoami 2>/dev/null || echo 'unknown')"

# Create target directory
mkdir -p build/app

# Check if rsync is available (more portable check)
if command -v rsync >/dev/null 2>&1; then
  echo "rsync found, using rsync path"
  rsync -zarv --prune-empty-dirs --include '*/' --include='*.ejs' --exclude='*' 'app/' 'build/app'
  echo "rsync completed"
else
  echo "rsync not found, using cp fallback"
  
  # Find .ejs files and copy them preserving directory structure
  if [ -d "app" ]; then
    find app -name '*.ejs' -type f | while IFS= read -r file; do
      target_dir="build/$(dirname "$file")"
      echo "Processing: $file -> $target_dir/"
      mkdir -p "$target_dir"
      cp "$file" "$target_dir/"
    done
  else
    echo "Warning: app/ directory not found"
  fi
  echo "cp fallback completed"
fi

# Simple verification
echo "Verification:"
if [ -d "build" ]; then
  find build -name "*.ejs" -type f | head -10
  echo "Directory structure:"
  find build -type d | head -10
else
  echo "ERROR: build/ directory not found"
  exit 1
fi

echo "copy_views.sh completed"