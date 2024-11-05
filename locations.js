const cleaningLocations = [
  '201',
  '203',
  '204',
  '205',
  'corridor',
  'sink',
];

exports.getLocations = () => {
  const date = new Date(); // 現在の日付と時刻を取得
  const month = date.getMonth() + 1; // getMonth() は0から11までの値を返すため、1を加えて実際の月を取得

  if (true) { // 偶数月の場合
    return cleaningLocations; // 全ての場所を返す
  } else { // 奇数月の場合
    // 'corridor' と 'sink' を除外して返す
    return cleaningLocations.filter(location => location !== 'corridor' && location !== 'sink');
  }
};