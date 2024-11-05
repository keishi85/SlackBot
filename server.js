const express = require('express');
const cron = require('node-cron');
const {
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
} = require('./index');

const serverApp = express();
const port = process.env.PORT || 3000;

// ルートエンドポイント
serverApp.get('/', (req, res) => {
  console.log("Get request")
  res.send('Glitch woke up');
});

// 日曜日の15:00に掃除の分担を割り当て　cron.schedule(schedule, task, options);
/*
  以下はCron形式の指定方法
  0: 分（0分、つまり15時ちょうどに実行）
  15: 時（15時）
  *: 日（毎日）
  *: 月（毎月）
  0: 曜日（0は日曜日）
*/
cron.schedule('44 14 * * 3', async () => {
  const channelId = 'C06RZ3YGR3J'; // チャンネルIDを指定してください

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

  const members = store.getUsers();
  const groupAMembers = Object.values(members).filter(user => user.group === 'A');
  const groupBMembers = Object.values(members).filter(user => user.group === 'B');

  // 掃除の振り分け
  assignedTasks = [];  // assignedTasksをクリア
  const is_AGroup = (WEEK_NUMBER % 2 === 0) // 隔週判定
  const cleaningLocations = shuffle(locations.getLocations());
  let messageText = '';
  
  // 前回の掃除をしていないメンバーをメンション
  const incompleteTasks = assignedTasks.filter(task => !task.completed);
  if (incompleteTasks.length > 0) {
    messageText += '前回の掃除を完了していないメンバーです\n次回は掃除をお願いします：\n';
    incompleteTasks.forEach(task => {
      messageText += `<@${task.userId}>: ${task.location}\n`;
    });
  }

  if (is_AGroup) { 
    WEEK_NUMBER += 1;
    messageText += `今週の掃除担当はグループAです。\n`;
    for (let i = 0; i < groupAMembers.length && i < cleaningLocations.length; i++) {
      messageText += `${cleaningLocations[i]}: <@${groupAMembers[i].user}>\n`;
      assignedTasks.push({ userId: groupAMembers[i].user, location: cleaningLocations[i] });
    }
  } else { 
    WEEK_NUMBER -= 1;
    messageText += `今週の掃除担当はグループBです。\n`;
    for (let i = 0; i < groupBMembers.length && i < cleaningLocations.length; i++) {
      messageText += `${cleaningLocations[i]}: <@${groupBMembers[i].user}>\n`;
      assignedTasks.push({ userId: groupBMembers[i].user, location: cleaningLocations[i] });
    }
  }
  // 一括メッセージ送信
  await app.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel: channelId,
    text: messageText
  });


  // データを保存
  saveData(WEEK_NUMBER, assignedTasks);

    // デバッグ用のコンソール出力
    // console.log("Group A Members: ", groupAMembers);
    // console.log("Group B Members: ", groupBMembers);
}, {
  scheduled: true,
  timezone: "Asia/Tokyo" // 日本時間
});

// リアクションのリスン
app.event('reaction_added', async ({ event, say }) => {
  console.log('reaction_added event triggered'); // デバッグ用のログ

  const task = assignedTasks.find(task => task.userId === event.user);
  
  if (task) {
    // ランダムな感謝メッセージを選択
    const thankYouMessage = thanksMessage[Math.floor(Math.random() * thanksMessage.length)];
    
    // await say(`<@${event.user}>さんが${task.location}の掃除を完了しました！ ${thankYouMessage}`);

    // タスク完了後に削除する
    assignedTasks = assignedTasks.filter(t => t.userId !== event.user);
    
    // すべてのタスクが完了したか確認
    if (assignedTasks.length === 0) {
      consecutiveDays += 1;
      await say(`全員が掃除を完了しました！これで${consecutiveDays}週連続で全員が掃除を完了しました！`);
      await say(`${thankYouMessage}`);
    }
    
    // データを保存
    saveData(WEEK_NUMBER, assignedTasks);
  }
});

// サーバーの起動
serverApp.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
