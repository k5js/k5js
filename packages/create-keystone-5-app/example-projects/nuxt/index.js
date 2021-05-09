const { Keystone } = require('@k5js/keystone');
const { Text } = require('@k5js/fields');
const { GraphQLApp } = require('@k5js/app-graphql');
const { AdminUIApp } = require('@k5js/app-admin-ui');
const { NuxtApp } = require('@k5js/app-nuxt');

/* keystone-cli: generated-code */
const { MongooseAdapter: Adapter } = require('@k5js/adapter-mongoose');
const PROJECT_NAME = 'Nuxt';
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
    new AdminUIApp({ name: PROJECT_NAME }),
    new NuxtApp({
      srcDir: 'src',
      buildDir: 'dist',
    }),
  ],
};
