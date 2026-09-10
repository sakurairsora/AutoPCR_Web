/**
 * 半月刊 /schedule 联调 mock：返回样例结构化日程（16 类全覆盖，与真实红标数据源一致）。
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
// 覆盖全部 16 类（与 schedule_sources 的类别一致），含：今天开启（验证通知）、进行中（验证常驻）、已结束（验证结束刷新）、未来（验证不显示）
const rows = [
    { key: '活动:1001', category: '活动', start_time: today, end_time: fmt(addDays(now, 7)), description: '幻惑的妖精 \n‐盛夏乐园中舞动的身影‐' },
    { key: '活动:1002', category: '活动', start_time: fmt(addDays(now, -2)), end_time: fmt(addDays(now, 5)), description: '活动 玩家经验值*1.5' },
    { key: '庆典:2001', category: '庆典', start_time: fmt(addDays(now, -2)), end_time: fmt(addDays(now, 5)), description: 'normal 掉落*3.0' },
    { key: '庆典:2002', category: '庆典', start_time: fmt(addDays(now, -2)), end_time: fmt(addDays(now, 5)), description: '圣迹 掉落*2.0' },
    { key: '扭蛋:3001', category: '扭蛋', start_time: fmt(addDays(now, -1)), end_time: fmt(addDays(now, 9)), description: 'up 艾拉,紫罗兰,菲欧,格蕾丝' },
    { key: '扭蛋:3002', category: '扭蛋', start_time: fmt(addDays(now, 1)), end_time: fmt(addDays(now, 10)), description: 'up 诗夏,白菲,涅妃,银莲' },
    { key: '免费十连:4001', category: '免费十连', start_time: today, end_time: fmt(addDays(now, 2)), description: '免费十连\n艾拉 紫罗兰' },
    { key: '公会战:5001', category: '公会战', start_time: fmt(addDays(now, -5)), end_time: today, description: '公会战' },
    { key: '公会战:5002', category: '公会战排名公示', start_time: fmt(addDays(now, 2)), end_time: fmt(addDays(now, 9)), description: '公会战排名公示' },
    { key: '特别地下城:6001', category: '特别地下城', start_time: fmt(addDays(now, -3)), end_time: fmt(addDays(now, 4)), description: '特别地下城' },
    { key: '季卡:7001', category: '季卡', start_time: fmt(addDays(now, -10)), end_time: fmt(addDays(now, 20)), description: '驾车游第9季同捆' },
    { key: '露娜塔:8001', category: '露娜塔', start_time: fmt(addDays(now, 3)), end_time: fmt(addDays(now, 8)), description: '露娜塔' },
    { key: '次元断层:9001', category: '次元断层', start_time: fmt(addDays(now, 4)), end_time: fmt(addDays(now, 9)), description: '次元断层' },
    { key: '赛马:10001', category: '赛马', start_time: fmt(addDays(now, -1)), end_time: fmt(addDays(now, 6)), description: '公主赛马' },
    { key: '登录奖励:11001', category: '登录奖励', start_time: today, end_time: fmt(addDays(now, 15)), description: '登录奖励（半周年）' },
    { key: '斗技场:12001', category: '斗技场', start_time: fmt(addDays(now, -4)), end_time: fmt(addDays(now, -1)), description: '斗技场' },
    { key: '驾车游:13001', category: '驾车游', start_time: fmt(addDays(now, -6)), end_time: fmt(addDays(now, 8)), description: '驾车游第9季' },
    { key: '新斗技场:14001', category: '新斗技场', start_time: fmt(addDays(now, -1)), end_time: fmt(addDays(now, 3)), description: '新斗技场' },
    { key: '深渊讨伐战:15001', category: '深渊讨伐战', start_time: fmt(addDays(now, 5)), end_time: fmt(addDays(now, 12)), description: '深渊讨伐战——真行寺' },
];
createServer((req, res) => {
    const url = req.url ?? '';
    console.log('[mock]', req.method, url);
    if (url.startsWith('/daily/api/schedule')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows));
        return;
    }
    // 其余透传 404（前端各处静默降级）
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{}');
}).listen(13201, () => console.log('mock schedule server on http://localhost:13201'));
