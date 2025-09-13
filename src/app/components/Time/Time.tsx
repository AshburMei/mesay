"use client";
import { useEffect, useState } from "react";

export default function Time() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    // 客户端初始化时间
    setTime(new Date());
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!time) {
    // SSR 阶段不渲染，避免 hydration mismatch
    return null;
  }

  // 补零
  const format = (num: number) => String(num).padStart(2, "0");

  // 双击打开新页面
  const handleDoubleClick = () => {
    window.open("/WholeTime", "_blank");
  };

  // 星期映射表
  const weekmap = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ];

  return (
    <div className="clock" onDoubleClick={handleDoubleClick}>
      {format(time.getHours())}:{format(time.getMinutes())}:
      {format(time.getSeconds())}
      <div className="year">
        {time.getFullYear()}年{time.getMonth() + 1}月{time.getDate()}
        日&nbsp;&nbsp;
        {weekmap[time.getDay()]}
      </div>
    </div>
  );
}
