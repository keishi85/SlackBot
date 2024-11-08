// This is not a real datastore, but it can be if you make it one :)

let messages = {};
let users = {};
let me = undefined;
let defaultChannel = undefined;

exports.getMessages = () => {
  return messages;
};

exports.addUser = (user) => {
  users[user.user] = user;
};

exports.getUser = (id) => {
  return users[id];
};

exports.setChannel = (channel) => {
  defaultChannel = channel;
};

exports.getChannel = () => {
  return defaultChannel;
};

exports.setMe = (id) => {
  me = id;
};

exports.getMe = () => {
  return me;
};

exports.getUsers = () => {
  const allUsers = { ...users };
  // console.log("All Users : ", users);
  
  if (me && !allUsers[me]) {
    allUsers[me] = { user: me, name: users[me]?.name || 'Unknown' };
  }
  return allUsers;
};

exports.clearUsers = () => {
  users = {};
};
