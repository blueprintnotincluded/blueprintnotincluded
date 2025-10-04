// Using Node.js `require()`
const mongoose = require('mongoose');

mongoose
  .connect('mongodb://database:27017/blueprintnotincluded', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
  })
  .then(() => console.log('Connected!'));
mongoose.connection.on('connected', () => {
  console.log('connected to db');
});
mongoose.connection.on('error', err => {
  console.log('Error! ' + err);
});
