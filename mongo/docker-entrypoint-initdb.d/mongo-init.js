db = db.getSiblingDB('blueprintnotincluded');

db.createCollection('blueprints');
db.createCollection('users');

db.blueprints.insertMany([
  {
    test: 'test',
  },
]);

db.users.insertMany([
  {
    test: 'test',
  },
]);
