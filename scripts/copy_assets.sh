mkdir -p build/assets
if [ $(command -v rsync) ]
then
  rsync -amv assets/ build/assets
else
  cp -r --parents assets/* build
fi

# Copy package.json for version info
cp package.json build/

# npm tasks in the deploy console run from /bpni/build via the copied
# package.json; ship the batch dispatcher they resolve (./scripts/batch.sh).
mkdir -p build/scripts
cp scripts/batch.sh build/scripts/
