"use client";

import { useState } from "react";

import { MemberFrame } from "./MemberFrame";
import { Portrait } from "./Portrait";

const sizes = [
  ["chico", "Small", 0.93],
  ["normal", "Standard", 1],
  ["grande", "Large", 1.14],
  ["xl", "Extra large", 1.3],
] as const;

export function ProfileScreen() {
  const [size, setSize] = useState<(typeof sizes)[number][0]>("normal");
  const [ready, setReady] = useState(true);
  const [reminder, setReminder] = useState(true);
  const [news, setNews] = useState(false);
  const scale = sizes.find((item) => item[0] === size)?.[2] ?? 1;

  return (
    <MemberFrame current="profile" status="Santiago Crexell">
      <main className="per" style={{ ["--ft" as string]: scale }}>
        <header className="per-cab">
          <div>
            <span className="k">Profile</span>
            <h1>Your profile</h1>
            <p className="datos">
              Your account email
              <br />
              Member since <b>August 2026</b> · Plan: <b>Monthly · 4 courses</b>
            </p>
            <div className="acc">
              <span className="btn fantasma chico">Change photo</span>
              <span className="btn fantasma chico">Remove</span>
            </div>
          </div>
          <div className="foto" aria-hidden="true">
            <Portrait />
          </div>
        </header>
        <section className="per-sec">
          <div>
            <h2>Your reading preferences</h2>
          </div>
          <div>
            <div className="fila">
              <span className="tx">
                Text size<small>For lesson text</small>
              </span>
              <span className="tam" role="group" aria-label="Text size">
                {sizes.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={size === id ? "act" : undefined}
                    onClick={() => setSize(id)}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </div>
            <p className="prev-t">
              No city begins from nothing. Every modern intervention arrives in a place that already
              exists, and what is there shapes the outcome more than we tend to admit.
            </p>
          </div>
        </section>
        <section className="per-sec">
          <div>
            <h2>Notifications</h2>
          </div>
          <div>
            <Toggle label="Your course is ready" hint="When the course is prepared" checked={ready} onChange={setReady} />
            <Toggle
              label="A module you haven’t finished"
              hint="One reminder, after seven days"
              checked={reminder}
              onChange={setReminder}
            />
            <Toggle
              label="News from Auteur"
              hint="Books, essays, and new courses. Once a month"
              checked={news}
              onChange={setNews}
            />
          </div>
        </section>
        <section className="per-sec">
          <div>
            <h2>Your plan</h2>
            <p className="d">US$25.99 per month for up to 4 courses. Billed monthly until you cancel.</p>
          </div>
          <div>
            <Invoice date="September 12, 2026" amount="US$25.99" />
            <Invoice date="August 12, 2026" amount="US$25.99" />
            <Invoice date="August 3, 2026" amount="US$11.99" />
            <div className="acciones">
              <span className="btn fantasma">Change plan</span>
              <span className="nota">Billed monthly until you cancel.</span>
            </div>
          </div>
        </section>
        <section className="per-sec">
          <div>
            <h2>Your account</h2>
          </div>
          <div>
            <div className="fila">
              <span className="tx">
                Email<small>Your account email</small>
              </span>
              <span className="btn fantasma chico">Change</span>
            </div>
            <div className="fila">
              <span className="tx">
                Email access<small>Use your email to return to your account.</small>
              </span>
            </div>
            <div className="fila">
              <span className="tx">
                Download your summaries
                <small>Your end-of-course summaries, including highlights and notes. Lesson texts aren’t included.</small>
              </span>
              <span className="btn fantasma chico">Download</span>
            </div>
            <div className="fila">
              <span className="tx danger">
                Delete account<small>Everything will be deleted. This can’t be undone</small>
              </span>
              <span className="btn fantasma chico danger">Close</span>
            </div>
          </div>
        </section>
      </main>
    </MemberFrame>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="fila">
      <span className="tx">
        {label}
        <small>{hint}</small>
      </span>
      <label className="sw">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span className="p" />
      </label>
    </div>
  );
}

function Invoice({ date, amount }: { date: string; amount: string }) {
  return (
    <div className="factura">
      <span>{date}</span>
      <b>{amount}</b>
      <button type="button">Invoice</button>
    </div>
  );
}
