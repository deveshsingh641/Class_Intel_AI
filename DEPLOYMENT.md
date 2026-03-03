# Deployment Guide: Vercel (Frontend) + Render (Backend)

This guide walks you through deploying your MERN stack application using Vercel for the React frontend and Render for the Node.js backend.

> **💡 Tip:** Before deploying to production, make sure everything works locally. See [MONGODB_SETUP.md](./MONGODB_SETUP.md) for local development setup and troubleshooting.

## 1. Prerequisites

*   **GitHub**: Ensure your project is pushed to a GitHub repository.
*   **MongoDB Atlas**: You need a cloud database.
    1.  Go to [MongoDB Atlas](https://www.mongodb.com/atlas).
    2.  Create a free cluster.
    3.  In **Network Access**, allow access from anywhere (`0.0.0.0/0`) or specific IPs.
    4.  In **Database Access**, create a user/password.
    5.  Get your **Connection String** (e.g., `mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority`).

---

## 2. Deploy Backend to Render

1.  Create an account on [Render.com](https://render.com).
2.  Click **New +** -> **Web Service**.
3.  Connect your GitHub repository.
4.  Configure the service:
    *   **Name**: `my-app-backend` (or similar)
    *   **Region**: Select one close to you.
    *   **Branch**: `main` (or your working branch)
    *   **Root Directory**: Leave empty (defaults to repo root).
    *   **Runtime**: **Node**
    *   **Build Command**: `npm install && npm run build:backend`
    *   **Start Command**: `npm run start:backend`
    *   **Instance Type**: Free

5.  **Environment Variables** (Scroll down to "Advanced"):
    Add the following keys:
    *   `MONGODB_URI`: Your MongoDB Connection String.
    *   `JWT_SECRET`: A long random string (e.g., `mysecretkey123`).
    *   `SKIP_FRONTEND_BUILD`: `true` (Important! This prevents the backend from trying to build the frontend).
    *   `CORS_ORIGIN`: `*` (We will update this later with your Vercel URL, but `*` is fine for testing).
    *   `HF_API_TOKEN`: Your HuggingFace token.
    *   `OPENAI_API_KEY`: Your OpenAI key (if used).

6.  Click **Create Web Service**.
7.  Wait for the deployment to finish. Copy the **Service URL** (e.g., `https://my-app-backend.onrender.com`).

---

## 3. Deploy Frontend to Vercel

1.  Create an account on [Vercel.com](https://vercel.com).
2.  Click **Add New...** -> **Project**.
3.  Import your GitHub repository.
4.  Configure the project:
    *   **Root Directory**: Click "Edit" and select `frontend`.
    *   **Framework Preset**: Vite (should be auto-detected).
    *   **Build Command**: `npm run build` (Default).
    *   **Output Directory**: `dist` (Default).

5.  **Environment Variables**:
    *   Key: `VITE_API_URL`
    *   Value: Your **Render Backend URL** (e.g., `https://my-app-backend.onrender.com`).
        *   *Note: Do not add a trailing slash `/`.*

6.  Click **Deploy**.

---

## 4. Final Configuration

1.  Once Vercel finishes, you will get a domain (e.g., `https://my-app-frontend.vercel.app`).
2.  Go back to **Render Dashboard** -> Your Backend Service -> **Environment**.
3.  Edit `CORS_ORIGIN` to be your Vercel domain (e.g., `https://my-app-frontend.vercel.app`).
    *   *This ensures only your frontend can talk to your backend.*
4.  **Save Changes** (Render will redeploy automatically).

## 5. Troubleshooting

*   **Build Fails on Render (Missing modules)**:
    *   Ensure `npm install` runs in the root so workspaces are respected.
    *   The command `npm install && npm run build:backend` covers this.
*   **Database Connection Error**:
    *   Check your `MONGODB_URI`.
    *   Ensure "Network Access" in MongoDB Atlas allows `0.0.0.0/0`.
*   **CORS Errors**:
    *   Check the browser console. If you see CORS errors, double-check that `CORS_ORIGIN` on Render matches your Vercel URL exactly (no trailing slash).
