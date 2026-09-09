sudo mkdir -p /opt/bitnami/apps/myapp
sudo mkdir /opt/bitnami//apps/blueprintnotincluded-backend/conf
sudo mkdir /opt/bitnami/apps/blueprintnotincluded-backend/htdocs

sudo vi /opt/bitnami/apps/blueprintnotincluded-backend/conf/httpd-prefix.conf

Include "/opt/bitnami/apps/blueprintnotincluded-backend/conf/httpd-app.conf"

sudo vi /opt/bitnami/apps/blueprintnotincluded-backend/conf/httpd-app.conf

ProxyPass / http://127.0.0.1:3000/
ProxyPassReverse / http://127.0.0.1:3000/

sudo vi /opt/bitnami/apache2/conf/bitnami/bitnami-apps-prefix.conf

Include "/opt/bitnami/apps/blueprintnotincluded-backend/conf/httpd-prefix.conf"

sudo /opt/bitnami/ctlscript.sh restart apache


/opt/bitnami/apache2/conf/httpd.conf

Listen 8080
ServerName localhost:8080

sudo vi /opt/bitnami/apache2/conf/bitnami/bitnami.conf
<VirtualHost _default_:8080>

forever start ./build/app.js

/opt/bitnami/mongodb/mongodb.conf
noauth = true                                                       
#auth = true
#setParameter = enableLocalhostAuthBypass=0
/opt/bitnami $ sudo ./ctlscript.sh restart mongodb
mongo
use admin

sudo node build/server.js

sudo /opt/bitnami/nodejs/bin/forever list
sudo /opt/bitnami/nodejs/bin/forever stop 21568
cd /opt/bitnami/apps/blueprintnotincluded-backend/
sudo npm install
sudo git reset --hard
sudo git pull
sudo vi .env (change to production)
sudo /opt/bitnami/nodejs/bin/forever start -e ../logs/err.20210704.log -o ../logs/out.20210704.log build/server.js
tail -f ../logs/err.20210704.log ../logs/out.20210704.log

sudo npm run updateBasedOn
sudo npm run updatePositionCorrection

mongoexport --collection=blueprints --db=blueprintnotincluded --out=blueprints_20191206.json
mongoexport --collection=users --db=blueprintnotincluded --out=users_20191206.json

sudo mongoexport --collection=blueprints --db=blueprintnotincluded --out=blueprints_20200811.json
sudo mongoexport --collection=users --db=blueprintnotincluded --out=users_20200811.json

sudo mongoexport --collection=blueprints --db=blueprintnotincluded --out=blueprints_20201208.json
sudo mongoexport --collection=users --db=blueprintnotincluded --out=users_20201208.json

sudo mongoexport --collection=blueprints --db=blueprintnotincluded --out=blueprints_20210704.json
sudo mongoexport --collection=users --db=blueprintnotincluded --out=users_20210704.json

mongoimport /drop /collection:blueprints /db:blueprintnotincluded /file:blueprints_20201208.json
mongoimport /drop /collection:users /db:blueprintnotincluded /file:users_20201208.json

mongoimport /drop /collection:blueprints /db:blueprintnotincluded /file:blueprints_20210704.json
mongoimport /drop /collection:users /db:blueprintnotincluded /file:users_20210704.json

# 20191204
use blueprintnotincluded
db.blueprints.updateMany( {}, { $rename: { "ownerId": "owner" } } )
db.blueprints.updateMany( {}, { $unset: { "ownerName": ""} } )
db.blueprints.find( {} ).forEach( function (x) {   
  x.likes = [x.owner.valueOf()];
  db.blueprints.save(x);
});

#20191215
sudo npm run updateBasedOn



http://blueprintnotincluded.com/
DOMAIN=blueprintnotincluded.com
WILDCARD=*.$DOMAIN
echo $DOMAIN && echo $WILDCARD
sudo certbot -d $DOMAIN -d $WILDCARD --manual --preferred-challenges dns certonly

IMPORTANT NOTES:
 - Congratulations! Your certificate and chain have been saved at:
   /etc/letsencrypt/live/blueprintnotincluded.com/fullchain.pem
   Your key file has been saved at:
   /etc/letsencrypt/live/blueprintnotincluded.com/privkey.pem
   Your cert will expire on 2020-02-28. To obtain a new or tweaked
   version of this certificate in the future, simply run certbot
   again. To non-interactively renew *all* of your certificates, run
   "certbot renew"
 - If you like Certbot, please consider supporting our work by:

   Donating to ISRG / Let s Encrypt:   https://letsencrypt.org/donate
   Donating to EFF:                    https://eff.org/donate-le

sudo wget -O bncert-linux-x64.run https://downloads.bitnami.com/files/bncert/latest/bncert-linux-x64.run
sudo mkdir /opt/bitnami/bncert
sudo mv bncert-linux-x64.run /opt/bitnami/bncert/
sudo chmod +x /opt/bitnami/bncert/bncert-linux-x64.run
sudo ln -s /opt/bitnami/bncert/bncert-linux-x64.run /opt/bitnami/bncert-tool

blueprintnotincluded.com *.blueprintnotincluded.com

Success

The Bitnami HTTPS Configuration Tool succeeded in modifying your installation.

The configuration report is shown below.

Backup files:
* /opt/bitnami/apache2/conf/httpd.conf.back.201911301159
* /opt/bitnami/apache2/conf/bitnami/bitnami-apps-prefix.conf.back.201911301159
* /opt/bitnami/apache2/conf/bitnami/bitnami.conf.back.201911301159

Find more details in the log file:

/tmp/bncert-201911301159.log

tail -f




one fix is that you add it to your resolutions in package.json

 "resolutions": {
    "serialize-javascript": "^2.1.1"
  }
and then possibly:

rm -r node_modules
npx npm-force-resolutions
npm install
worked for me

~/.bashrc
/opt/bitnami/nodejs/bin/node
/usr/local/bin/node

/opt/bitnami/.bitnamirc
/opt/bitnami/nodejs/bin
/usr/local/bin

ssh-keygen -t rsa -b 4096 -C "spam_simonlourson@live.fr"
Your identification has been saved in /home/bitnami/.ssh/id_rsa.
Your public key has been saved in /home/bitnami/.ssh/id_rsa.pub.

eval $(ssh-agent)
ssh-add ~/.ssh/id_rsa

sudo su
sudo npm install

tar czvf primeng.tar.gz primeng/

# Build from extract
# Copy assets/manual/
npm run fixHtmlLabels -- database.json
npm run addInfoIcons -- database.json
npm run generateIcons
npm run generateGroups
npm run generateWhite
npm run generateRepack