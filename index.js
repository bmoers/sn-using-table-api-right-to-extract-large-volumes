// expected output: 9007199254740992
const numberToHex = number => {
    const HEX = 16;
    return Number(number).toString(HEX).toUpperCase()
}
var total = 100000;
var pageSize = 300;
var pages = Math.ceil(total / pageSize);
console.log(pages)
var sysIdPerPAge = Math.floor(Number.MAX_SAFE_INTEGER / pages)
console.log(numberToHex(sysIdPerPAge))
const queryArr = [];
for (var i = 1; i <= pages; i++) {
    var min = i == 1 ?     undefined :  numberToHex(sysIdPerPAge * (i - 1));
    var max = i == pages ? undefined : numberToHex(sysIdPerPAge * i);
    queryArr.push({ min: min, i: i, max: max })
}
console.log(queryArr)
console.log(Number.MAX_SAFE_INTEGER)

