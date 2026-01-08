"""WebSocket routes for real-time LLM streaming."""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Store active WebSocket connections per analysis
active_connections: Dict[int, Set[WebSocket]] = {}


class ConnectionManager:
    """Manages WebSocket connections."""
    
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, analysis_id: int):
        """Connect a WebSocket for an analysis."""
        await websocket.accept()
        if analysis_id not in self.active_connections:
            self.active_connections[analysis_id] = set()
        self.active_connections[analysis_id].add(websocket)
        logger.info(f"WebSocket connected for analysis {analysis_id}")
    
    def disconnect(self, websocket: WebSocket, analysis_id: int):
        """Disconnect a WebSocket."""
        if analysis_id in self.active_connections:
            self.active_connections[analysis_id].discard(websocket)
            if not self.active_connections[analysis_id]:
                del self.active_connections[analysis_id]
        logger.info(f"WebSocket disconnected for analysis {analysis_id}")
    
    async def send_message(self, analysis_id: int, message: dict):
        """Send message to all connections for an analysis."""
        if analysis_id in self.active_connections:
            disconnected = set()
            for connection in self.active_connections[analysis_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending WebSocket message: {e}")
                    disconnected.add(connection)
            
            # Remove disconnected connections
            for conn in disconnected:
                self.disconnect(conn, analysis_id)


manager = ConnectionManager()


@router.websocket("/analysis/{analysis_id}")
async def websocket_endpoint(websocket: WebSocket, analysis_id: int):
    """
    WebSocket endpoint for streaming analysis progress.
    
    Args:
        websocket: WebSocket connection
        analysis_id: Analysis ID to stream updates for
    """
    await manager.connect(websocket, analysis_id)
    try:
        # Send initial connection message
        await websocket.send_json({
            "type": "connected",
            "analysis_id": analysis_id,
            "message": "Connected to analysis stream"
        })
        
        # Keep connection alive - just wait for disconnect
        # Don't block on receive - the client may not send messages
        import asyncio
        while True:
            try:
                # Wait for message with short timeout, catch disconnect gracefully
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                # If client sends a message, echo it back
                await websocket.send_json({
                    "type": "echo",
                    "message": f"Received: {data}"
                })
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                try:
                    await websocket.send_json({
                        "type": "ping",
                        "message": "Connection alive"
                    })
                except Exception:
                    break
            except WebSocketDisconnect:
                break
            except Exception as e:
                # Client disconnected (code 1001 = going away, 1000 = normal close)
                if "1001" in str(e) or "1000" in str(e):
                    logger.debug(f"Client disconnected normally: {e}")
                else:
                    logger.warning(f"WebSocket receive error: {e}")
                break
    except WebSocketDisconnect:
        manager.disconnect(websocket, analysis_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket, analysis_id)


def get_manager() -> ConnectionManager:
    """Get the connection manager instance."""
    return manager

