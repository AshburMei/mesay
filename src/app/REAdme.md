## 1启动后端和前端端口

cd mesay
pnpm run devall

# 检查上一次启动后的端口是否关闭

## 关闭后端服务

# 查找端口

lsof -i :3000

# 记录PID 一串数字

# 终止进程

kill -9 1234 # 强制终止
kill 1234 # 发送 SIGTERM 信号，允许进程优雅退出

## next-auth 是next.js的认证库

# 酷狗音乐api

1修改了api的原文件,在server.js中解决 跨域会话（Cookie/Token）共享 和 前端-后端认证流程
原因是 1跨域限制前端（localhost:4000）和后端（localhost:3000）是不同的域名，浏览器默认会阻止跨域请求的 Cookie/Session 共享,登陆后只在前端中设置了登录状态,但后端没有同步,解决方案是

1.1 后端主动设置跨域cookie
app.use((req, res, next) => {
if (req.path !== '/' && !req.path.includes('.')) {
res.set({
'Access-Control-Allow-Credentials': true,
'Access-Control-Allow-Origin': CORS_ALLOW_ORIGIN || req.headers.origin || '\*',
'Access-Control-Allow-Headers': 'X-Requested-With,Content-Type',
'Access-Control-Allow-Methods': 'PUT,POST,GET,DELETE,OPTIONS',
'Content-Type': 'application/json; charset=utf-8',
});
}
req.method === 'OPTIONS' ? res.status(204).end() : next();
});

# 替换为

const cors = require('cors');

// 启用 CORS（允许跨域）
app.use(cors({
origin: 'http://localhost:4000', // 明确指定前端地址
credentials: true, // 允许跨域携带 Cookie
}));

// 保留 OPTIONS 预检请求处理
app.use((req, res, next) => {
if (req.method === 'OPTIONS') {
res.status(204).end();
} else {
next();
}
});
将
if (req.protocol === 'https') {
res.append('Set-Cookie', `KUGOU_API_PLATFORM=${process.env.platform}; PATH=/; SameSite=None; Secure`);
} else {
res.append('Set-Cookie', `KUGOU_API_PLATFORM=${process.env.platform}; PATH=/`);
} #替换为
// 统一设置 Cookie 属性（无论 HTTP/HTTPS）
res.append('Set-Cookie', `KUGOU_API_PLATFORM=${process.env.platform}; PATH=/; SameSite=None; Secure=${req.protocol === 'https'}`);

修改后在启动服务器后可正常使用

### 前端请求需要携带credentials: 'include'

fetch('http://localhost:3000/login/openplat?code=xxx', {
credentials: 'include',
});

## 请求音频文件问题

# 1.当通过new Audio(url)创建音频对象时,浏览器会自动将音频文件缓存在内存中,临时的

# 2.请求的虽然是flac文件,但是浏览器默认使用的是分块加载,而不是一次性下载整个文件

HTTP Range Requests目的是1,节省带宽和流量 2用户可能听不完 3快速加载,无需等待完整下载 4边加载边播放 5支持随机跳转 ,只从特定位置开始而不用下载之前的部分 6避免内存占用过高

## PWA应用 指渐进式网络应用能够在不稳定的网络环境或完全离线状态下依然提供核心功能的能力

PWA离线功能主要依赖以下技术实现：

Service Worker：运行在浏览器后台的脚本，充当网络代理，可以拦截和处理网络请求

Cache API：用于存储和检索请求/响应对象

IndexedDB：客户端存储大量结构化数据的API

Web App Manifest：定义应用的元数据

## 不同技术的处理方式

1.Cache API / Service Worker ,缓存数据 不会自动清除，新旧用户可能共用缓存（除非主动清理）。
为每个用户分配独立缓存名（如 cache-{userId}）,在用户退出登录时，调用 caches.delete() 清理旧数据

# 2.

IndexedDB / localStorage 数据持久化存储，跨用户共享（需手动隔离）。使用用户ID作为命名空间（如 localStorage.setItem('playlist\_' + userId, data)）。

## localstorage和sessionstorage的区别

localStorage 和 sessionStorage 都是浏览器提供的 本地存储 API，用于在客户端（浏览器）存储键值对数据

# 1. localStorage

永久存储,同源的所有标签页共享,通常5-10 MB,用于保存用户的偏好,登陆状态等

# 2.sessionstoeage

仅在当前会话有效,存储大小5-10 MB,用于临时保存表单数据 页面传参数等

# 存数据

localStorage.setItem('username', 'Alice'); // 存储数据
如果存对象或者是数组的话,需要用JSON.stringfy()进行转化
读取: JSON.parse(localStorage.getItem())

sessionStorage（临时存储）
sessionStorage.setItem('token', 'abc123'); // 关闭标签页后消失

# 读数据

const username = localStorage.getItem(' username')

const token = sessionStorage.getItem('token')

# 删除数据

localStorage.removeItem(' username'); // 删除 username
sessionStorage.removeItem('token'); // 删除 token

# 当应用支持多用户登录时，必须确保每个用户的数据独立存储，避免混淆。

// 存储数据（用户A：userId=123）
const userId = 123;
localStorage.setItem(`config_${userId}`, JSON.stringify({ theme: 'dark' }));

// 读取数据
const userConfig = JSON.parse(localStorage.getItem(`config_${userId}`));

// 清除对应用户数据
Object.keys(localStorage).forEach(key => {
if (key.startsWith(`config_${userId}`)) {
localStorage.removeItem(key);
}
});

## useEffect允许在函数组件中执行副作用操作,相当于类组件中componentDidMount和componentDidUpdate 和 componentWillUnmount 这三个生命周期方法的组合

在严格模式下,react会故意执行挂载-卸载-重新挂载组件
useEffect(() => {
console.log('Effect ran'); // 开发环境下会打印两次
return () => console.log('Cleanup ran'); // 先执行一次清理
}, []);
///当依赖项变化时，React 可能会：

先用旧依赖项运行清理函数

然后用旧依赖项运行 effect (模拟旧props/state)

最后用新依赖项运行 effect
////
useEffect(() => {
// 副作用逻辑
return () => {
// 清理逻辑（可选）
};
}, [dependencies]); // 依赖数组,在1.当组件挂载或某些状态变化时需要从api获取数据, 空数组表示只在组件挂载时执行2.设置和清理事件监听器时 3.手动操作dom 4.依赖状态变化时执行操作,5设置和清除定时器

## useState
