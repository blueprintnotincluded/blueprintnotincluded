Remove-Item -ErrorAction SilentlyContinue index.js 
Remove-Item -ErrorAction SilentlyContinue index.d.ts 
Remove-Item -ErrorAction SilentlyContinue index.d.ts.map
cd src
Get-ChildItem * -Include *.js -Recurse | Remove-Item
Get-ChildItem * -Include *.d.ts -Recurse | Remove-Item
Get-ChildItem * -Include *.d.ts.map -Recurse | Remove-Item
cd ..