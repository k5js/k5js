const { Keystone } = require('@k5js/keystone');
const { Text } = require('@k5js/fields');
const { GraphQLApp } = require('@k5js/app-graphql');
const { AdminUIApp } = require('@k5js/app-admin-ui');
const { StaticApp } = require('@k5js/app-static');

/* keystone-cli: generated-code */
const { MongooseAdapter: Adapter } = require('@k5js/adapter-mongoose');
const PROJECT_NAME = 'My KeystoneJS Project';
const adapterConfig = {};
/* /keystone-cli: generated-code */

const keystone = new Keystone({
  adapter: new Adapter(adapterConfig),
});

keystone.createList('Todo', {
  schemaDoc: 'A list of things which need to be done',
  fields: {
    name: { type: Text, schemaDoc: 'This is the thing you need to do' },
  },
});

module.exports = {
  keystone,
  apps: [
    new GraphQLApp(),
    new StaticApp({ path: '/', src: 'public' }),
    new AdminUIApp({ name: PROJECT_NAME, enableDefaultRoute: true }),
  ],
};
