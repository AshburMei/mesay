import { useEffect, useState } from "react";
export default function Time() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  // 补零
  const format = (num: number) => String(num).padStart(2, "0");
  // 新开一个界面
  const handleDoubleClick = () => {
    window.open("/WholeTime", "_blank");
  };
  //map表
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
