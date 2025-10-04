import mongoose from 'mongoose';
import { UserModel } from './models/user';
import { BlueprintModel } from './models/blueprint';

export class Database {
  constructor() {
    // Mongoose 7.x: strictQuery is false by default, but being explicit
    mongoose.set('strictQuery', false);

    mongoose.connect(process.env.DB_URI as string).catch(reason => {
      if (process.env.NODE_ENV !== 'test') {
        console.log('Mongoose connection error: ' + reason);
      }
    });
    mongoose.connection.on('connected', () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log('Mongoose connected to database');
      }
      UserModel.init();
      BlueprintModel.init();
    });
    mongoose.connection.on('error', err => {
      if (process.env.NODE_ENV !== 'test') {
        console.log('Mongoose connection error: ' + err);
      }
    });
    mongoose.connection.on('disconnected', () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log('Mongoose disconnected');
      }
    });
  }
}
