const { Keystone } = require('@k5js/keystone');
const { GraphQLApp } = require('@k5js/app-graphql');
const { AdminUIApp } = require('@k5js/app-admin-ui');
const { Text } = require('@k5js/fields');
const { MongooseAdapter } = require('@k5js/adapter-mongoose');
const Stars = require('./fields/Stars');
const MultiCheck = require('./fields/MultiCheck');

const keystone = new Keystone({
  adapter: new MongooseAdapter({ mongoUri: 'mongodb://localhost/custom-field' }),
});

keystone.createList('Movie', {
  fields: {
    name: { type: Text },
    rating: { type: Stars, starCount: 5 },
    categories: {
      type: MultiCheck,
      options: ['Action', 'Comedy', 'Drama'],
      defaultValue: [true, false, false],
    },
  },
});

module.exports = {
  keystone,
  apps: [new GraphQLApp(), new AdminUIApp({ name: 'custom-field', enableDefaultRoute: true })],
};
