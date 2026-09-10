/**
 * 半月刊 /schedule 联调 mock：返回样例结构化日程。
 * 用法：node scripts/mock-schedule-server.mjs  → 监听 13201
 * 再以 AUTOPCR_SERVER_HOST=http://localhost:13201 起 vite，即可端到端验证前端通知链。
 * （仅联调用，不影响生产；后端 PR 合入后即可弃用）
 */
import { createServer } from 'node:http';

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
const addDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
const now = new Date();
// 样例：一条今天开启（验证通知）、两条进行中（验证常驻）、一条已结束（验证结束刷新）
const rows = [
    { key: '活动:1001', category: '活动', start_time: fmt(now), end_time: fmt(addDays(now, 7)), description: '幻惑的妖精 \n‐盛夏乐园中舞动的身影‐' },
    { key: '庆典:2001', category: '庆典', start_time: fmt(addDays(now, -2)), end_time: fmt(addDays(now, 5)), description: 'normal 掉落*3.0' },
    { key: '新斗技场:3001', category: '新斗技场', start_time: fmt(addDays(now, -1)), end_time: fmt(addDays(now, 3)), description: '新斗技场' },
    { key: '公会战:4001', category: '公会战', start_time: fmt(addDays(now, -5)), end_time: fmt(now), description: '公会战' },
    { key: '扭蛋:5001', category: '扭蛋', start_time: fmt(addDays(now, 1)), end_time: fmt(addDays(now, 10)), description: 'up 艾拉,紫罗兰,菲欧' },
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
