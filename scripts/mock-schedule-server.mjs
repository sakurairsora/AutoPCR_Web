/**
 * 半月刊 /schedule 联调 mock：样例与真实半月刊页面同构（含噪声条目与已结束条目，验证过滤口径）。
 * 用法：node scripts/mock-schedule-server.mjs  → 监听 13201
 * 再以 AUTOPCR_SERVER_HOST=http://localhost:13201 起 vite，即可端到端验证前端通知链。
 * （仅联调用，不影响生产；后端 PR 合入后即可弃用）
 */
import { createServer } from 'node:http';

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
const addDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
const now = new Date();
const today = fmt(now);
// 与半月刊页面同构的样例（相对 today 偏移）：
//  进行中应显示：女神祭(+2~-8)、圣迹/神殿掉落(-3~+5)、vh 掉落(-3~+12)、新斗技场(-2~+2)、up 卡池(-2~+5)
//  今天开启（应触发当日通知）：活动 (-1~+8)
//  纯噪声不显示：玩家经验值*1.5(-9~+8)、公会战排名公示(+8~+20)
//  已结束不显示：公会战(-8~-1)、驾车游(-60~+5 应显示，注意对照)、斗技场(-10~-3)
const rows = [
    { key: '季卡:1', category: '季卡', start_time: fmt(addDays(now, -60)), end_time: fmt(addDays(now, 5)), description: '驾车游第9季同捆' },
    { key: '扭蛋:2', category: '扭蛋', start_time: fmt(addDays(now, -2)), end_time: fmt(addDays(now, 5)), description: 'up 艾拉,紫罗兰,菲欧,格蕾丝,白菲,涅妃,银莲,els,琉璃,莱莱,机娘,坏女人,龙安,爱梅斯,咲哈哈,兰法,小小甜心,龙妈,星栞,风剑,白猫,火猫,晶,飞田,蝶妈,高达,似似花,611,克总' },
    { key: '活动:3', category: '活动', start_time: fmt(addDays(now, -1)), end_time: fmt(addDays(now, 8)), description: ', And I Will \n牢牢紧握在手中' },
    { key: '活动:4', category: '活动', start_time: fmt(addDays(now, 1)), end_time: fmt(addDays(now, 8)), description: '女神祭' },
    { key: '庆典:5', category: '庆典', start_time: fmt(addDays(now, -9)), end_time: fmt(addDays(now, 8)), description: '活动 玩家经验值*1.5' },
    { key: '庆典:6', category: '庆典', start_time: fmt(addDays(now, -3)), end_time: fmt(addDays(now, 5)), description: '圣迹 掉落*2.0' },
    { key: '庆典:7', category: '庆典', start_time: fmt(addDays(now, -3)), end_time: fmt(addDays(now, 5)), description: '神殿 掉落*2.0' },
    { key: '庆典:8', category: '庆典', start_time: fmt(addDays(now, -3)), end_time: fmt(addDays(now, 12)), description: 'vh 掉落*2.0' },
    { key: '庆典:9', category: '庆典', start_time: fmt(addDays(now, -3)), end_time: fmt(addDays(now, 12)), description: 'vh mana*2.0' },
    { key: '公会战排名公示:10', category: '公会战排名公示', start_time: fmt(addDays(now, -2)), end_time: fmt(addDays(now, 18)), description: '公会战排名公示' },
    { key: '新斗技场:11', category: '新斗技场', start_time: fmt(addDays(now, -2)), end_time: fmt(addDays(now, 2)), description: '新斗技场' },
    { key: '扭蛋:12b', category: '扭蛋', start_time: today, end_time: fmt(addDays(now, 5)), description: 'fes|up 千歌,星栞,妮妮,爱丽丝,优花梨' },
    { key: '扭蛋:12', category: '扭蛋', start_time: today, end_time: fmt(addDays(now, 7)), description: 'up 诗夏,紫罗兰,菲欧,格蕾丝,白菲,涅妃,银莲,els,琉璃,莱莱,机娘,坏女人,龙安,爱梅斯,咲哈哈,兰法,小小甜心,龙妈,星栞,风剑,白猫,火猫,晶,飞田,蝶妈,高达,似似花,611,克总' },
    { key: '庆典:13', category: '庆典', start_time: fmt(addDays(now, 5)), end_time: fmt(addDays(now, 10)), description: 'normal 掉落*3.0' },
    { key: '庆典:14', category: '庆典', start_time: fmt(addDays(now, 5)), end_time: fmt(addDays(now, 19)), description: '地下城 mana*2.0' },
    { key: '活动:15', category: '活动', start_time: fmt(addDays(now, 6)), end_time: fmt(addDays(now, 13)), description: '幻惑的妖精 \n‐盛夏乐园中舞动的身影‐' },
    { key: '公会战:16', category: '公会战', start_time: fmt(addDays(now, -8)), end_time: fmt(addDays(now, -1)), description: '公会战' },
    { key: '公会战排名公示:17', category: '公会战排名公示', start_time: fmt(addDays(now, 17)), end_time: fmt(addDays(now, 38)), description: '公会战排名公示' },
    { key: '斗技场:18', category: '斗技场', start_time: fmt(addDays(now, -10)), end_time: fmt(addDays(now, -3)), description: '斗技场' },
];
createServer((req, res) => {
    const url = req.url ?? '';
    if (url.startsWith('/daily/api/schedule')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows));
        return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{}');
}).listen(13201, () => console.log('mock schedule server on http://localhost:13201'));
