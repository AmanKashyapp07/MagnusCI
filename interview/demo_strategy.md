# MagnusCI: Live Interview Demonstration Strategy

Since your goal is to present this to an interviewer via a screen share on your Mac, the most impressive strategy is **NOT** to hide everything behind a cloud URL. 

The best strategy is to run the system locally on your Mac, split your screen to show the background worker terminal, and trigger a live GitHub push using **Ngrok**. This proves you built a real, decoupled system.

Here is your exact execution plan for the day of the interview.

---

## 🛑 Step 1: Pre-Interview Setup (10 mins before)

Before the call starts, ensure these underlying services are running on your Mac:
1. **Docker Desktop**: Open the app and ensure the engine is running.
2. **PostgreSQL**: Ensure your local database is running on port `5432`.
3. **Redis**: Ensure your local Redis server is running on port `6379`.

---

## 💻 Step 2: Open 4 Terminal Windows

You will run the system exactly as a decoupled architecture demands. Open 4 separate terminal windows or tabs side-by-side.

### Terminal 1: Start the API Gateway
```bash
cd backend
npm run dev
# OR node src/index.js
```
*Leave this running. This is the web server that receives GitHub webhooks.*

### Terminal 2: Start the Background Worker
```bash
cd backend
node src/worker.js
```
*Leave this running. This is the daemon that controls Docker.*

### Terminal 3: Start the React Frontend
```bash
cd frontend
npm run dev
```
*Leave this running. Open `http://localhost:5173` in your browser.*

### Terminal 4: Start Ngrok (The Magic Trick)
To allow GitHub to send webhooks to your local Mac, run Ngrok on the API gateway port:
```bash
ngrok http 5001
```
Ngrok will give you a public Forwarding URL (e.g., `https://abc-123.ngrok-free.app`). 
1. Copy this URL.
2. Go to your dummy GitHub repository -> Settings -> Webhooks.
3. Update the webhook URL to: `https://abc-123.ngrok-free.app/api/webhooks/github`

---

## 🎬 Step 3: The Live Presentation Script

When the interviewer asks to see the project, share your screen. **Make sure they can see both your Browser and Terminal 2 (The Worker).**

**1. The Hook (Show the UI)**
> *"Here is the MagnusCI dashboard. It's connected to my GitHub account via OAuth. As you can see, the architecture is entirely decoupled—the React frontend talks to an Express gateway, but the heavy lifting is done by a background worker daemon."*

**2. The Trigger (Make a commit)**
> *"Let me show you a live build. I'm going to push a small code change to my linked GitHub repository right now."*
*(Push a commit via another terminal or the GitHub UI).*

**3. The Reveal (Point to the Terminal)**
> *"Watch the background worker terminal. Because the Express gateway pushed a job to Redis, the worker just woke up. You can see it cloning the repository, detecting the language, and right now, it is communicating with the `/var/run/docker.sock` to dynamically spawn an Alpine container."*

**4. The Climax (Show the WebSockets)**
> *(Quickly click the 'View Logs' button in the React UI).*
> *"Because the worker attached a stream to the Docker container, it is broadcasting the standard output via Socket.io. As you can see on the dashboard, the logs are streaming live from the container directly into my browser in real-time."*

---

### Why this strategy is brilliant:
If you just showed them a website, they would assume it's a basic web app. By showing them the **Worker Terminal** spinning up Docker containers in real-time on your machine, you physically prove that you built a complex infrastructure orchestrator, not just a React app.
