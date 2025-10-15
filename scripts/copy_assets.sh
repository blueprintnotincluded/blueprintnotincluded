mkdir -p build/assets
if [ $(command -v rsync) ]
then
  rsync -amv assets/ build/assets
else
  cp -r --parents assets/* build
fi

# Copy package.json for version info
cp package.json build/
