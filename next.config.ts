/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["imge.kugou.com"], // 添加酷狗图片域名
    // 或者使用 remotePatterns 进行更灵活的配置（推荐）
    remotePatterns: [
      {
        protocol: "http",
        hostname: "imge.kugou.com",
        port: "",
        pathname: "/stdmusic/**",
      },
      {
        protocol: "https",
        hostname: "imge.kugou.com",
        port: "",
        pathname: "/stdmusic/**",
      },
    ],
  },
};

module.exports = nextConfig;
