const { App } = require('@slack/bolt');
const store = require('./store');
const groups = require('./groups');
const locations = require('./locations');
const thanksMessage = require('./message');
const { saveData, loadData } = require('./saveData'); 
const cron = require('node-cron'); // node-cronをインポート
const moment = require('moment-timezone'); // moment-timezoneをインポート
const express = require('express');

const serverApp = express();
const port = process.env.PORT || 3000;


// ルートエンドポイント
serverApp.get('/', (req, res) => {
  console.log("Get request");
  
  // メンバーを表示
  // show_list();
  
  // 掃除担当決定の関数を実行
  performScheduledTasks();
  
  res.send('Glitch woke up');
});

// その他のルートが存在しない場合のエラーハンドリング
serverApp.use((req, res, next) => {
  res.status(404).send("Sorry, that route deesn't exist")
})

// サーバーの起動
serverApp.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}).on('error', (err) => {
  console.error('Express server failed to start due to error', err)
});

// 初期データの読み込み
let { WEEK_NUMBER, assignedTasks, consecutiveDays, preMessageTimestamp } = loadData();

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN
});


app.event('app_home_opened', async ({ event, say }) => {
  // Look up the user from DB
  let user = store.getUser(event.user);

  if (!user) {
    user = {
      user: event.user,
      channel: event.channel
    };
    store.addUser(user);

    await say(`Hello world, and welcome <@${user}>!`);
  } else {
    await say('Hi again!');
  }
});

// メッセージが投稿された時に呼ばれるメソッド
// app.message(async ({ message, say }) => {
//   await say(message.text);
// });

// Start your app
(async () => {
  // // アプリケーション起動時にデータを読み込む
  const data = loadData();
  WEEK_NUMBER = data.WEEK_NUMBER;
  assignedTasks = data.assignedTasks;
  consecutiveDays = data.consecutiveDays;
  preMessageTimestamp = data.messageTimestamp;
  
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();

// メンバーIDリストを取得
async function fetchChannelMembers(channelId) {
  try {
    const result = await app.client.conversations.members({
      token: process.env.SLACK_BOT_TOKEN,
      channel: channelId
    });
    return result.members;
  } catch (error) {
    console.error(error);
    return [];
  }
}

// 指定されたUserIDからメンバーの情報を取得
async function fetchUserInfo(userId) {
  try {
    const result = await app.client.users.info({
      token: process.env.SLACK_BOT_TOKEN,
      user: userId
    });
    return result.user;
  } catch (error) {
    console.error(error);
    return null;
  }
}

// 新しいメンバーが入った際にメンバー情報を更新
app.event('member_joined_channel', async ({ event, say }) => {
  const channelId = event.channel;
  const members = await fetchChannelMembers(channelId);

  // Clear previous users
  store.clearUsers();

  for (const memberId of members) {
    const user = await fetchUserInfo(memberId);
    if (user) {
      store.addUser({ user: user.id, name: user.real_name });
    }
  }

  await say('チャンネルのメンバー情報を更新しました。');
});

// 掃除場所をランダムにシャッフルする関数
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function performScheduledTasks() {
  console.log("Cleaning Assignment")
  const channelId = 'C06RZ3YGR3J'; // チャンネルIDを指定してください
  
  // 掃除割り当てのメッセージ（先週送信したもの）に対して，リアクションがあった人たちは掃除を完了
  processComplitedTasks(channelId, preMessageTimestamp);

  const memberIds = await fetchChannelMembers(channelId);

  store.clearUsers();
    
  const botId = await app.client.auth.test({
    token: process.env.SLACK_BOT_TOKEN
  }).then(response => response.user_id);

  for (const memberId of memberIds) {
    if (memberId === botId) continue; // 自分自身のBotを除外

    const user = await fetchUserInfo(memberId);
    if (user && !user.is_bot) { // 他のBotを除外
      const group = groups.getGroup(user.real_name); // グループを取得
      if (group) {
        store.addUser({ user: user.id, name: user.real_name, group }); // グループ情報を追加
      }
    }
  }
  
  // 前回の掃除をしていないメンバーをメンション
  let messageTextPlase = ''
  const incompleteTasks = assignedTasks.filter(task => !task.completed);
  if (incompleteTasks.length > 0) {
    consecutiveDays = 0;
    messageTextPlase += '前回の掃除を完了していないメンバーです\n次回は掃除をお願いします\n';
    incompleteTasks.forEach(task => {
      messageTextPlase += `${task.location}: <@${task.userId}>\n`;
    });
  }
  else {
    consecutiveDays += 1;
    const thankYouMessage = thanksMessage[Math.floor(Math.random() * thanksMessage.length)];
    messageTextPlase += `全員が掃除を完了しました！これで${consecutiveDays}週連続で全員が掃除を完了しました！\n${thankYouMessage}\n`;
  }

  const members = store.getUsers();
  const groupAMembers = Object.values(members).filter(user => user.group === 'A');
  const groupBMembers = Object.values(members).filter(user => user.group === 'B');

  // 掃除の振り分け
  assignedTasks = [];  // assignedTasksをクリア
  const is_AGroup = (WEEK_NUMBER % 2 === 0) // 隔週判定
  const cleaningLocations = shuffle(locations.getLocations());
  let messageText = '';

  if (is_AGroup) { 
    WEEK_NUMBER += 1;
    messageText += `今週の掃除担当はグループAです\n`;
    for (let i = 0; i < groupAMembers.length && i < cleaningLocations.length; i++) {
      messageText += `${cleaningLocations[i]}: <@${groupAMembers[i].user}>\n`;
      assignedTasks.push({ userId: groupAMembers[i].user, location: cleaningLocations[i] });
    }
  } else { 
    WEEK_NUMBER -= 1;
    messageText += `今週の掃除担当はグループBです\n`;
    for (let i = 0; i < groupBMembers.length && i < cleaningLocations.length; i++) {
      messageText += `${cleaningLocations[i]}: <@${groupBMembers[i].user}>\n`;
      assignedTasks.push({ userId: groupBMembers[i].user, location: cleaningLocations[i] });
    }
  }
  // 一括メッセージ送信
  const response = await app.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel: channelId,
    text: `${messageTextPlase}\n${messageText}`
  });
  
  const messageTimestamp = response.ts;

  // データを保存
  saveData(WEEK_NUMBER, assignedTasks, consecutiveDays, messageTimestamp);
};

// リアクションの集計関数
async function processComplitedTasks(chennelId, timestamp){
  try {
    const reactionData = await app.client.reactions.get({
      token: process.env.SLACK_BOT_TOKEN,
      channel: chennelId,
      timestamp: timestamp,
    });
    
    if (reactionData.message && reactionData.message.reactions) {
      // リアクションした全ユーザーを取得（スタンプの種類: (UserID, ...)）
      const userWhoReacted = new Set();  // ユニークな値の集合
      reactionData.message.reactions.forEach(reaction => {
        reaction.users.forEach(userId => userWhoReacted.add(userId));
      });
      
      // 取得したUserIDをもとにタスク間両者を削除
      userWhoReacted.forEach(userId => {
        assignedTasks = assignedTasks.filter(task => task.userId !== userId);
      });
      
      console.log("リアクションした人は掃除を完了");      
    }
    return 0;
  }catch(error){
    console.error("Failed to fetch reactions:", error);
    console.log(timestamp);
    return 0;
  }
}

// メンバーリストを返す
app.message(async ({ message, say }) => {
  if (message.text.trim().toLowerCase() === "list") {
    const channelId = message.channel;

    // チャンネル内のメンバー情報を更新
    const memberIds = await fetchChannelMembers(channelId);

    store.clearUsers();
    
    const botId = await app.client.auth.test({
      token: process.env.SLACK_BOT_TOKEN
    }).then(response => response.user_id);

    for (const memberId of memberIds) {
      if (memberId === botId) continue; // 自分自身のBotを除外

      const user = await fetchUserInfo(memberId);
      if (user && !user.is_bot) { // 他のBotを除外
        const group = groups.getGroup(user.real_name);
        if (group) {
          store.addUser({ user: user.id, name: user.real_name, group });
        }
      }
    }

    // メンバー情報を出力
    const members = store.getUsers();
    const groupAMembers = Object.values(members).filter(user => user.group === 'A').map(user => user.name);
    const groupBMembers = Object.values(members).filter(user => user.group === 'B').map(user => user.name);

    await say(`グループAのメンバー一覧: ${groupAMembers.join(', ')}`);
    await say(`グループBのメンバー一覧: ${groupBMembers.join(', ')}`);

    // デバッグ用のコンソール出力
    console.log("Group A Members: ", groupAMembers);
    console.log("Group B Members: ", groupBMembers);
  } 
});

async function show_list() {

    const channelId = 'C06RZ3YGR3J'; // チャンネルIDを指定してください
  
    // チャンネル内のメンバー情報を更新
    const memberIds = await fetchChannelMembers(channelId);

    store.clearUsers();
    
    const botId = await app.client.auth.test({
      token: process.env.SLACK_BOT_TOKEN
    }).then(response => response.user_id);

    for (const memberId of memberIds) {
      if (memberId === botId) continue; // 自分自身のBotを除外

      const user = await fetchUserInfo(memberId);
      if (user && !user.is_bot) { // 他のBotを除外
        const group = groups.getGroup(user.real_name);
        if (group) {
          store.addUser({ user: user.id, name: user.real_name, group });
        }
      }
    }

    // メンバー情報を出力
    const members = store.getUsers();
    const groupAMembers = Object.values(members).filter(user => user.group === 'A').map(user => user.name);
    const groupBMembers = Object.values(members).filter(user => user.group === 'B').map(user => user.name);



    // デバッグ用のコンソール出力
    console.log("Group A Members: ", groupAMembers);
    console.log("Group B Members: ", groupBMembers);
}


// リアクションのリスン
// app.event('reaction_added', async ({ event, say }) => {
//   console.log('reaction_added event triggered'); // デバッグ用のログ

//   const task = assignedTasks.find(task => task.userId === event.user);
  
//   if (task) {
//     // ランダムな感謝メッセージを選択
//     const thankYouMessage = thanksMessage[Math.floor(Math.random() * thanksMessage.length)];
    
//     // await say(`<@${event.user}>さんが${task.location}の掃除を完了しました！ ${thankYouMessage}`);

//     // タスク完了後に削除する
//     assignedTasks = assignedTasks.filter(t => t.userId !== event.user);
    
//     // すべてのタスクが完了したか確認
//     if (assignedTasks.length === 0) {
//       consecutiveDays += 1;
//       await say(`全員が掃除を完了しました！これで${consecutiveDays}週連続で全員が掃除を完了しました！`);
//       await say(`${thankYouMessage}`);
//     }
    
//     // データを保存
//     saveData(WEEK_NUMBER, assignedTasks);
//   }
// });

// 金曜日に掃除を完了していない人をメンションして促す
// cron.schedule('0 9 * * 5', async () => { // 毎週金曜日の9:00 AMに実行
//   const incompleteTasks = assignedTasks.filter(task => !task.completed);
//   if (incompleteTasks.length > 0) {
//     let messageText = 'まだ掃除が完了していない人は以下の通りです。掃除をお願いします！\n';
//     incompleteTasks.forEach(task => {
//       messageText += `<@${task.userId}>: ${task.location}\n`;
//     });
//     const channelId = 'YOUR_CHANNEL_ID'; // 対象のチャンネルIDに変更
//     await app.client.chat.postMessage({
//       token: process.env.SLACK_BOT_TOKEN,
//       channel: channelId,
//       text: messageText
//     });
//   }
// });

// 必要な関数と変数をエクスポート
module.exports = {
  app,
  fetchChannelMembers,
  fetchUserInfo,
  store,
  groups,
  locations,
  thanksMessage,
  saveData,
  loadData,
  WEEK_NUMBER,
  assignedTasks,
  consecutiveDays,
  shuffle
};