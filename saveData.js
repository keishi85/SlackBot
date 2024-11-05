const fs = require("fs");
const path = require("path");

const dataFilePath = path.join(__dirname, "data.json");

// データをファイルに保存
function saveData(
  WEEK_NUMBER,
  assignedTasks,
  consecutiveDays,
  messageTimestamp
) {
  const data = {
    WEEK_NUMBER,
    assignedTasks,
    consecutiveDays, // 連続日数を保存
    messageTimestamp,
  };
  fs.writeFileSync(dataFilePath, JSON.stringify(data));
}

// データをファイルから読み込み
function loadData() {
  if (fs.existsSync(dataFilePath)) {
    const data = JSON.parse(fs.readFileSync(dataFilePath, "utf8"));
    return data;
  }
  return {
    WEEK_NUMBER: 0,
    assignedTasks: [],
    consecutiveDays: 0,
    messageTimestamp: 0,
  }; // デフォルト値に連続日数を追加
}

module.exports = { saveData, loadData };