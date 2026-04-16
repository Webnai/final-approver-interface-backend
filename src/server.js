const mongoose = require('mongoose');
const { buildApp } = require('./app');

const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/final-approver';

const start = async () => {
  await mongoose.connect(mongoUri);
  const app = buildApp();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on port ${port}`);
  });
};

start();
