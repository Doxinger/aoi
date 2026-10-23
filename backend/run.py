from app import create_app
from app.config import server_host, server_port

app = create_app()

if __name__ == "__main__":
    host, port = server_host(), server_port()
    print(f"АОИ запущен: http://{host}:{port}", flush=True)
    app.run(host=host, port=port)
