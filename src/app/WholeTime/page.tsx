"use client";
import { clearInterval } from "timers";
import Time from "../components/Time/Time";
import Timer from "./components/Timer/Timer";
import "./page.scss";
import TimerBack from "./components/TimerBack/TimerBack";
export default function WholeTime() {
  return (
    <div className="whole-time">
      <Time />
      <Timer />
      <TimerBack />
    </div>
  );
}
