require('dotenv').config();

const { Keystone } = require('@k5js/keystone');
const { PasswordAuthStrategy } = require('@k5js/auth-password');
const { MongooseAdapter } = require('@k5js/adapter-mongoose');
const { GraphQLApp } = require('@k5js/app-graphql');
const { AdminUIApp } = require('@k5js/app-admin-ui');
const { NextApp } = require('@k5js/app-next');

const { Event, Talk, User, Rsvp, Organiser, Sponsor, ForgottenPasswordToken } = require('./schema');

const MEETUP = require('./meetupConfig');
const initialiseData = require('./initialData');

const keystone = new Keystone({
  name: MEETUP.name,
  adapter: new MongooseAdapter(),
  onConnect: initialiseData,
});

keystone.createList('Event', Event);
keystone.createList('Rsvp', Rsvp);
keystone.createList('Talk', Talk);
keystone.createList('User', User);
keystone.createList('Organiser', Organiser);
keystone.createList('Sponsor', Sponsor);
keystone.createList('ForgottenPasswordToken', ForgottenPasswordToken);

const authStrategy = keystone.createAuthStrategy({
  type: PasswordAuthStrategy,
  list: 'User',
});

const adminApp = new AdminUIApp({
  adminPath: '/admin',
  authStrategy,
  pages: [
    {
      label: 'Meetup',
      children: ['Event', 'Talk', 'Organiser', 'Sponsor'],
    },
    {
      label: 'People',
      children: ['User', 'Rsvp'],
    },
  ],
});

module.exports = {
  keystone,
  apps: [new GraphQLApp(), adminApp, new NextApp({ dir: 'site' })],
};
