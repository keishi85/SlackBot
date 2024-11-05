const groupA = [];
const groupB = [];
//'Linman Shen'

exports.getGroup = (name) => {
  if (groupA.includes(name)) {
    return 'A';
  } else if (groupB.includes(name)) {
    return 'B';
  } else {
    return null;
  }
};
