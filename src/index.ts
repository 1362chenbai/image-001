export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const prompt = url.searchParams.get("prompt");
    const type = url.searchParams.get("type") || "image";

    if (!prompt) {
      return new Response(this.getHTMLPage(), {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    const modelConfigs = {
      image: {
        ids: ["alibaba/wan-2.6-image", "@cf/alibaba/wan-2.6-image", "wan-2.6-image", "alibaba-wan-2.6-image", "@cf/stabilityai/stable-diffusion-xl-base-1.0"],
        mime: "image/png",
        label: "图像生成 (Wan 2.6)",
      },
      music: {
        ids: ["minimax/music-2.6", "@cf/minimax/music-2.6", "music-2.6", "minimax-music-2.6"],
        mime: "audio/mpeg",
        label: "音乐生成 (MiniMax 2.6)",
      },
      video: {
        ids: ["pixverse/v5.6", "@cf/pixverse/v5.6", "pixverse-v5.6", "pixverse/v5.6-video"],
        mime: "video/mp4",
        label: "视频生成 (PixVerse v5.6)",
      },
    };

    const config = modelConfigs[type];
    if (!config) {
      return new Response(`不支持的生成类型: ${type}。可选: image, music, video`, { status: 400 });
    }

    let lastError = "";
    for (const modelId of config.ids) {
      try {
        const result = await env.AI.run(modelId, { prompt });
        
        // Check if result is a task (async model)
        if (result && typeof result === 'object' && result.id) {
          const taskId = result.id;
          let status = 'pending';
          let finalResult = null;
          let attempts = 0;

          while (status !== 'completed' && attempts < 30) {
            await new Promise(r => setTimeout(r, 2000)); // Poll every 2s
            const pollRes = await env.AI.getTaskStatus(taskId);
            status = pollRes.status;
            if (status === 'completed') {
              finalResult = pollRes.result;
              break;
            }
            if (status === 'failed') {
              throw new Error(`Task failed: ${pollRes.error}`);
            }
            attempts++;
          }

          if (!finalResult) throw new Error("Generation timed out");
          
          // The finalResult for async models might be a URL or binary
          const responseData = typeof finalResult === 'string' && finalResult.startsWith('http') 
            ? await fetch(finalResult).then(r => r.arrayBuffer())
            : finalResult;

          return new Response(responseData, {
            headers: { "content-type": config.mime, "x-model-used": modelId },
          });
        }

        // Sync model result
        return new Response(result, {
          headers: { "content-type": config.mime, "x-model-used": modelId },
        });
      } catch (e) {
        lastError = e.message;
        console.log(`Model ${modelId} failed: ${e.message}`);
      }
    }

    return new Response(`所有尝试的模型均失败。最后一次错误: ${lastError}`, { 
      status: 500,
      headers: { "content-type": "text/plain;charset=UTF-8" } 
    });
  },

  getHTMLPage() {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>OpenClaw Multimodal AI</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f4f7f6; }
        .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 90%; max-width: 500px; text-align: center; }
        h1 { color: #333; margin-bottom: 1.5rem; }
        textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 1rem; resize: none; height: 100px; box-sizing: border-box; }
        select, button { padding: 10px 20px; border-radius: 8px; font-size: 1rem; cursor: pointer; }
        select { border: 1px solid #ddd; margin-right: 10px; }
        button { background: #007AFF; color: white; border: none; transition: 0.2s; }
        button:hover { background: #005BBF; }
        .result { margin-top: 2rem; display: none; }
        .result img, .result video { max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🌟 多模态 AI 生成</h1>
        <textarea id="prompt" placeholder="输入你的创意提示词..."></textarea>
        <div style="margin-bottom: 1.5rem;">
          <select id="type">
            <option value="image">🖼️ 图像 (Wan 2.6)</option>
            <option value="music">🎵 音乐 (MiniMax 2.6)</option>
            <option value="video">🎬 视频 (PixVerse v5.6)</option>
          </select>
          <button onclick="generate()">生成</button>
        </div>
        <div id="result" class="result">
          <p id="status">正在生成，请稍候...</p>
          <div id="output"></div>
        </div>
      </div>

      <script>
        async function generate() {
          const prompt = document.getElementById('prompt').value;
          const type = document.getElementById('type').value;
          if(!prompt) return alert('请输入提示词！');

          const resDiv = document.getElementById('result');
          const outDiv = document.getElementById('output');
          const statusP = document.getElementById('status');
          
          resDiv.style.display = 'block';
          outDiv.innerHTML = '';
          statusP.innerText = '🚀 正在调用云端 GPU 生成中...';

          const url = \`?prompt=\${encodeURIComponent(prompt)}&type=\${type}\`;
          
          try {
            const response = await fetch(url);
            if(!response.ok) throw new Error(await response.text());
            
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            
            statusP.innerText = '✨ 生成成功！';
            if(type === 'image') {
              outDiv.innerHTML = \`<img src="\${objectUrl}">\`;
            } else if(type === 'music') {
              outDiv.innerHTML = \`<audio controls src="\${objectUrl}" autoplay>\`;
            } else if(type === 'video') {
              outDiv.innerHTML = \`<video controls src="\${objectUrl}" autoplay loop>\`;
            }
          } catch(e) {
            statusP.innerText = '❌ 错误: ' + e.message;
          }
        }
      </script>
    </body>
    </html>
    `;
  },
} satisfies ExportedHandler<Env>;
