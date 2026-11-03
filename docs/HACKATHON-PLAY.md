# Said: remaining-hours play

Researched 3 Nov 2026. Hacking is already open (from 4 Nov 2026, 12:01 AM IST). Submissions close **Saturday 7 Nov 2026, 11:59 PM IST**, which is **1:29 PM US Eastern**. Submit by late morning Eastern. A project a stranger can run beats a better one they cannot.

## Pitch

Said is the referee in the group chat: the coder cannot start the job until the coder and the customer have both agreed to the same deal, and if someone later says that was not the deal, Said reads back the exact words both of them accepted, with the time.

## What this event scores

WeMakeDevs reads every submission and builds the shortlist. Finalists are scored by a joint panel from Switch, DevTools Academy, and WeMakeDevs. Individual judge names are **not published** for Flip the Switch. The four questions are published, and DevTools Academy prints the weights:

| Weight | Question they ask |
| --- | --- |
| 30% | Is Switch central, and would the project stop working without it? |
| 25% | Does it run, and could someone clone the repo and reproduce it? |
| 25% | Is it a fresh idea that solves a problem a real team has? |
| 20% | Do the demo video and README make it clear what you built and how Switch is used? |

Switch is mandatory. The README has to show which agents you connected, how the channel is set up, and how to run it. You may bring an existing agent or library. The Switch setup and the workflow have to be built during the hackathon. AI coding tools are allowed. You have to understand the submission and be able to explain it. One person on the team should be able to do that out loud.

**Submit:** a public repository, a short demo video of the workflow running, and that README. A blog is optional and also enters Best Blog. The official pages do not publish a maximum video length. WeMakeDevs' own September 2026 hackathon (First Commit) asked for a recorded video of about three minutes and said there is no live demo, so the video is what judges see. For this event, record **90 seconds**, keep a longer cut under three minutes in the description, and upload the short one as the submission. Set the video to public before you paste the link.

Prize numbers on the WeMakeDevs page and the Luma page agree: Track 01 Best Business Workflow **$2,000**, Track 02 **$2,000**, Best Core Contribution **$100 x 20**, Code with Wispr **$500**, Best Blog **AirPods 5**, **#HowISwitch** Logitech mechanical keyboards for the top 5 posts (Luma), swag for 20 random submissions, a certificate for every submission. The DevTools Academy page still says top 10 core PRs and AirPods for five blog posts. Treat WeMakeDevs plus Luma as current. Said is not entering core. Do not spend these hours on Switch pull requests.

### Who will actually watch it

These people are organizers and recent judges for this community. They are not confirmed as the Flip the Switch panel.

- **Kunal Kushwaha**, founder of WeMakeDevs, presents the Luma event. On 7 Oct 2026 he wrote up First Commit. What he singled out: Suraksha, built for a person who is not the one holding the phone; Beacon Night Shift, which waits for a spoken yes before it acts and only then may handle that fault alone; CampusEvac, where neither player can finish alone. He also noted that strong entries came with a live link, not only a repository.
- **Aayush Sharma**, COO of WeMakeDevs, wrote the 29 Oct 2026 guide for this hackathon ([How to Build a Switch Workflow That Finishes a Real Task](https://www.wemakedevs.org/blogs/how-to-build-a-switch-workflow-that-finishes-a-real-task)). He says a bot that only answers questions scores badly on the criterion that matters most, because a webhook could have done it. He wants two agents that cannot be one machine, addressing chosen on purpose, conventions in the room, a person standing where a mistake gets expensive, an artefact you can point at, and a template a stranger can run. He says the approval line that holds is the frame to put in the video, because judges have already seen a hundred agents that would have opened the pull request.
- **Ankur Tyagi** founded DevTools Academy, which sits on the panel as an organization. He is not named as an individual judge.
- **Mohammed Aboul-Magd**, General Manager at SandboxAQ, is the public voice of Switch. His launch line is the brief: capable agents trapped in separate tools, and a coordination tax. He is not named as a judge.
- **Sachin Sharma** (CMO, WeMakeDevs) and **Rohan Kochhar** (India Growth, Wispr Flow) judge WeMakeDevs' separate Wispr challenge, not this hackathon. Their public questions are still the best hint for the $500 side track: a specific problem someone would keep using, Wispr visible in the demo and on the usage card, a thing that works, a short video anyone can follow. That page says the questions are weighted and does not print the percentages.

## Demo script (90 seconds)

Record the live Switch room. Label any mock as a simulation and do not use it as the submission video. Replies often land in the **thread**, not the channel. Look there before you reshoot. Do not type a `!` command you do not mean: Switch runs the first character, and `!reset` will fire on camera.

Say this, while the screen shows the thing:

| Time | Say | What is on screen (Switch primitive) |
| --- | --- | --- |
| 0:00 | "The coder cannot start until the coder and the customer agree to the same deal." | Title card with that sentence. No stack, no hello. |
| 0:08 | "Dana asks for dark mode, two extra days, four hundred dollars. Today that lives in a chat and the coder just starts." | Mattermost message from the client account. |
| 0:18 | "This channel is a Switch room. Said can hear anyone. The builder can hear only the owner and the owner's agents. Watch Switch refuse Dana." | Client messages `@builder`. Switch posts the refusal: not permitted to direct messages here. Green session dots, so it is clearly running. |
| 0:32 | "Said writes a numbered draft. Dana's yes is Dana's Switch id, not her display name. One yes does nothing." | Said's reply: waiting for the other person. Console or ledger shows one approval and the participant id. |
| 0:45 | "Same version, same fingerprint, second yes. Now it is locked. Only Said can rewrite this room document." | Both accepts. Room document `Said Ledger` updates. Mention `!list-documents` if it is already on screen. |
| 0:58 | "Said hands the builder a signed start, aimed at the builder, not the room. The builder checks the ledger itself, then Claude Code changes the site." | Targeted handoff in the thread. Client site gains dark mode. Receipt comes back into the room. |
| 1:12 | "Dana says she never agreed to four hundred dollars. Said quotes the locked line and the time. It does not ask a model." | Evidence reply with the quote and timestamp. |
| 1:22 | "Take Switch away and there is no id to bind the yes to, no refusal, no document only Said can write, and no checked handoff. The job would just start." | Hold on the locked ledger and the changed page. Stop. |

The wow is the **second yes**, and the page changing only after it. Put that in the middle. The refusal at 0:18 is how a non-engineer sees Switch doing work.

Record this take the moment the path is stable. Record a second take as backup. If the model call fails on the day, play the backup. Judges score a demo that never reaches the page change as a miss. A labeled recording of a real run is the punchline.

## README and submission checklist

The README's first screen is the 20% score and half of the 30%. A judge should get the pitch, the Switch test, and a command in under three minutes.

First screen, in this order:

1. The one-sentence pitch above.
2. The remove-Switch sentence from the last demo beat, as four concrete losses: participant id, visible addressing refusal, room document only Said can update, targeted start the builder re-checks.
3. Agents: `said` (anyone can address) and `builder` (owner and the owner's agents). Channel: Mattermost room, id in `.env.example` as a placeholder. Identity: Switch participant id, never a display name.
4. Two run paths, labeled:
   - Live: `docs/SETUP_LIVE.md`, then `npm run setup`, `npm run register`, `npm run enroll`, `npm run doctor`, `npm run dev`. Node `>=22.12`.
   - Simulation: `npm run demo:offline`. First line of that section says this is not Switch.
5. What "done" looks like: both accepts, ledger revision, site change, receipt. Link the 90-second video.
6. How to prove it without watching: `npm test`.

Before you hit submit:

- Repository is **public**. A private repo fails "clone it and reproduce it."
- Video is public, shows the workflow running, and includes the refusal, the second yes, and the page change.
- README names the agents, the channel, and the run steps. Commit the room template if you have one. Aayush's test: delete the room and the agents and recreate them the way a stranger would, on Saturday morning, while someone else drives and you stay quiet.
- `npm run doctor` is green on the machine you will mention.
- Offline mode is labeled everywhere it appears.
- One teammate can explain the builder's checks without reading the code: sender is Said, signature, both distinct ids, same terms fingerprint, agreement locked, job not already done.
- Wispr screenshot, blog URL, and #HowISwitch link pasted into the submission if you are entering those.
- Submit on the WeMakeDevs form with hours to spare. Do not start a new feature after the backup video exists.

## Track 01 scoring map

| Moment the judge can see | Switch 30% | Execution 25% | Creativity and impact 25% | Presentation 20% |
| --- | --- | --- | --- | --- |
| Mattermost channel with `said` and `builder` online | Agents in the room the team already uses. Sessions, not just membership. | `doctor` and the video agree. | A client and a developer share one room. | Open here. Names a person, Dana, and a job. |
| Client talks to `builder`, Switch refuses in the channel | Addressing is enforced by Switch and the refusal is visible. | Policy is `owner_and_owner_agents`, checked after register. | The expensive agent is not a mention away from the customer. | This is the first Switch proof. Leave it in the cut. |
| One accept, still waiting. Id under the plain sentence. | Accept is the sender's participant id. | State machine: one approval, builder idle. Tests cover this. | The real pain is a disputed change order, not a chatbot. | "Waiting for Dana to agree." Hash sits underneath, labeled "fingerprint of the exact terms." |
| Second accept. `Said Ledger` updates. Signature holds. | Room document. Only the creating agent can change it. Authorship is server-side. | Browser or notary verifies the signature. A bad document stops authorization. | A team can keep this after the weekend. The decision outlives the session. | Show the document, not a diagram of it. |
| Targeted `said-start`. Site changes. Receipt returns. | Handoff is `send_targeted_message`. Builder reloads the ledger. Working directory is the client repo. | Claude Code or Codex runs only after lock, in a worktree, with typecheck and build. | The artefact is the changed site, not a conversation. | The page change is the frame they remember. |
| "I thought we agreed." Exact quote and time. | The room holds the decision. Said does not invent it. | Answers from the signed ledger only. | This is the Monday-morning question Aayush describes. | A non-engineer can follow the answer. |
| README remove-Switch paragraph plus clone steps | This is the question worth 30%. | This is the question worth 25%. | Say who keeps using it: a developer and a client who do not share a terminal. | This is the question worth 20%. |

Switch's own docs are the reason this shape scores. Room instructions do not review a tool call. The shared-responsibility page says Switch does not look at what a tool call would do, and a room does not turn a tool call into a reviewed action. It tells operators to put the control where the agent runs: in the provider's permissions, or in a sign-off step in the system the agent is acting on. Aayush says the same thing in the hackathon guide: Switch will not enforce your approval convention for you. Said is that sign-off step. Say that once in the README, in plain words, and point at the refusal plus the idle builder as the proof.

## What not to do

- No orange, terracotta, or purple-gradient UI. No sparkle or robot marks. No emoji as interface. No lorem ipsum. No em dashes or en dashes in the README, the UI, the blog, or the video captions. Hyphens in compound words are fine.
- No AI-default submission text. Judges reading a pile of entries recognize a generic paragraph. Write the four Switch losses in your own words.
- No chat-only demo. If you cannot point at the changed page, the workflow is a conversation. Aayush calls that the most common weak submission.
- No slides in the 90 seconds. The product is the content.
- No unlabeled simulation. If the video is mock Switch, it fails the mandatory-Switch test.
- No client who can successfully order the builder around. That throws away the 30% and the safety story.
- No new feature after the backup take exists. The last stretch is the video, the README, the clean run, and the form.
- No `!` command pasted into the room to "show the syntax" while recording.

## Side tracks, only if the main path is recorded

**Code with Wispr ($500).** There is no separate numeric rubric on the Flip the Switch page. The rule is: dictate prompts, room instructions, and the README with Wispr Flow, then attach a screenshot of **Insights, Your usage**, from the desktop app (Mac or Windows, not the phone). The card shows words per minute, total words, fixes, and desktop categories. The category that matters is **AI prompts**, plus documents if you dictated the README. The prize is the best project built by voice, so the screenshot has to match work a judge can see in the repo. Dictating after the code is done, into an empty note, will look empty next to the git history. The other Wispr challenge ranks "most words" as its own prize. This side track does not say that. A modest card tied to real prompts beats a huge card tied to nothing.

**Best Blog (AirPods 5).** WeMakeDevs asks for what you made, how you set it up, and what you learned. DevTools Academy's side-track note adds clarity, accuracy, and help for a first-time Switch user. Write that post for someone who has finished the ten-minute quickstart. The useful piece is the sign-off gap: room instructions are the briefing, and the control has to live in a step Switch will actually enforce. One screenshot of the refusal, one of the locked ledger.

**#HowISwitch.** Post the real workflow with the hashtag. Luma says Logitech mechanical keyboards for the top 5 posts. Show the room and the page change. A logo and a sentence will not travel.

## Order of work from here

1. Today: one path only. Client asks, one accept waits, second accept locks, builder changes the site, dispute quotes the ledger, client cannot address the builder.
2. The hour that path works: record the 90-second backup, even if the console is still rough.
3. Next: README first screen and a stranger's run. Fix whatever they trip on. Then the pretty pass on the two sentences the camera reads ("Waiting for Dana to agree", "Both agreed. Work can start.").
4. Friday night US / Saturday morning IST: final video, Wispr screenshot, blog if it is already drafted, #HowISwitch post, submit.
5. Stop when the form is in. Do not reopen scope.

## Links

Official event

1. [Flip the Switch on WeMakeDevs](https://www.wemakedevs.org/hackathons/switch) (tracks, prizes, FAQ, mandatory Switch, shortlist then joint panel)
2. [DevTools Academy event page](https://www.devtoolsacademy.com/hackathons/flip-the-switch) (weights 30/25/25/20, public repo, short demo, README contents)
3. [Official rules](https://www.wemakedevs.org/hackathons/switch/rules) (18+, sanctions, AI tools allowed, you keep the IP, sponsor gets a promo license)
4. [Schedule](https://www.wemakedevs.org/hackathons/switch/schedule) (close 7 Nov 2026, 11:59 PM IST)
5. [Submit](https://www.wemakedevs.org/hackathons/switch/submit)
6. [Luma registration](https://luma.com/switchai) (Kunal Kushwaha; prize list including Wispr, AirPods, top 5 #HowISwitch keyboards)
7. [Aayush Sharma, 29 Oct 2026, how to build a workflow that finishes](https://www.wemakedevs.org/blogs/how-to-build-a-switch-workflow-that-finishes-a-real-task)
8. [Cubbbix summary of the same rules](https://cubbbix.com/blog/flip-the-switch-hackathon/) (secondary; agrees on the four questions)

Judges and what this community has rewarded

9. [Kunal Kushwaha, First Commit recap, 7 Oct 2026](https://www.wemakedevs.org/blogs/first-commit-hackathon-recap-and-whats-next)
10. [First Commit: what judges looked for](https://www.wemakedevs.org/aws/first-commit) ("one feature that runs beats five that almost do"; three-minute video is the demo)
11. [First Commit winners](https://www.wemakedevs.org/aws/first-commit/projects)
12. [Kunal's LinkedIn post announcing Flip the Switch](https://www.linkedin.com/posts/kunal-kushwaha_alright-people-next-big-online-hackathon-activity-7518713887358255104-LEt5)
13. [DevTools Academy, Ankur Tyagi](https://www.devtoolsacademy.com/contact)
14. [SandboxAQ Switch launch, Mohammed Aboul-Magd](https://www.sandboxaq.com/press/sandboxaq-open-sources-switch-bring-any-ai-agent-into-any-team-chat)
15. [No Hands Wispr judges](https://www.wemakedevs.org/wispr/judges) (different contest; Kunal, Rohan Kochhar, Aayush, Sachin Sharma; usage card plus a short clear demo)

Switch docs for the sign-off story

16. [Shared responsibility](https://docs.switchagents.ai/switch-rooms/resources/shared-responsibility) (put the control in the provider's permissions or a sign-off step; checked against Console 0.31.0)
17. [Working safely with agents](https://docs.switchagents.ai/switch-rooms/resources/working-safely-with-agents) (addressing, working directory, sign-off gate)
18. [Identity and access](https://docs.switchagents.ai/switch-rooms/internals/identity-and-access) (addressing is separate from authorization; refusals are visible)
19. [Rooms and resources](https://docs.switchagents.ai/switch-rooms/internals/rooms-and-resources) (only the creating agent can change a room document; authorship is enforced)
20. [Agent protocol](https://docs.switchagents.ai/switch-rooms/internals/agent-protocol) (`send_targeted_message`, `create_room_document`, `update_room_document`)
21. [Share context](https://docs.switchagents.ai/switch-rooms/using/shared-context) (room instructions brief every agent; documents need a reason to be opened)
22. [Work in a room](https://docs.switchagents.ai/switch-rooms/using/work-in-a-room) (who may approve a provider permission request)
23. [Switch README, level 3](https://github.com/sandbox-quantum/switch) (the person who asked signs the work off)

Wispr card

24. [Wispr Flow, Your usage](https://docs.wisprflow.ai/articles/8760230576-your-usage-tab-track-your-dictation-stats-in-wispr-flow) (Insights on desktop: words per minute, totals, AI prompts category)

How winning demos are built

Dated where the page shows a date. AngelHack and ElevenHacks did not show one, so use them as technique, not as this event's rules.

25. [Devpost, the demo does more work than you think](https://h01.devpost.com/updates/44631-your-demo-video-is-doing-more-work-than-you-think) (fetched 3 Nov 2026, listed as 5 months old: problem, running product, why this stack, so-what; public video; write the description yourself)
26. [Storyblok x Code and Coffee, 2025 submission note](https://storyblok-code-coffee.devpost.com/updates/38462-1-week-to-go-submission-checklist-demo-video-tips) (public repo, README, video of the product running, captions)
27. [bex.co, July 2025, demo and submission](https://bex.co/blog/2025/07/07/web3-hackathons-done-right) (one sentence, one loop, record the backup early, README a stranger can run)
28. [AngelHack, demo structure](https://angelhack.com/blog/10-tips-to-help-you-rock-your-next-hackathon-demo/) (about half the runtime is the live path; one memorable moment; recorded backup)
29. [ElevenHacks submission guide](https://hacks.elevenlabs.io/guide) (one sentence in the first five seconds; 60 to 90 seconds; show the product)
