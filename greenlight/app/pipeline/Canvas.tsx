/**
 * Canvas — React Flow pipeline visualization wrapper.
 * Dynamically imported (ssr: false) to avoid hydration issues.
 */

"use client"

import { useCallback, useState, useEffect } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { useRunStatus } from "./hooks/useRunStatus"
import PipelineNode from "./nodes/PipelineNode"
import SidePanel from "./SidePanel"
import type { CanvasNodeData } from "./types"

const nodeTypes: NodeTypes = { pipelineNode: PipelineNode }

const rfTheme = {
  background: "#09090b",
  minimapMask: "rgb(24,24,27,0.6)",
  nodeBorder: "#27272a",
}

interface CanvasProps {
  runId: string
}

export default function Canvas({ runId }: CanvasProps) {
  const { nodes: rawNodes, edges: rawEdges, loading, error, refresh } = useRunStatus(runId)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Sync nodes/edges when data loads or changes
  useEffect(() => {
    if (rawNodes.length > 0) setNodes(rawNodes as Node[])
  }, [rawNodes, setNodes])

  useEffect(() => {
    if (rawEdges.length > 0) setEdges(rawEdges as Edge[])
  }, [rawEdges, setEdges])

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const d = node.data as unknown as CanvasNodeData
    if (d.status === "pending") return
    setSelectedNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null
  const selectedNodeData = selectedNode
    ? (selectedNode.data as unknown as CanvasNodeData)
    : null

  // Loading
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="animate-pulse space-y-4 text-center">
          <div className="mx-auto h-6 w-48 rounded bg-zinc-800" />
          <p className="text-sm text-zinc-500">Loading pipeline…</p>
        </div>
      </div>
    )
  }

  // Error
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300 max-w-md">
          <p className="font-medium mb-1">Failed to load pipeline</p>
          <p className="text-xs text-red-400">{error}</p>
          <button
            onClick={refresh}
            className="mt-3 rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-full bg-zinc-950">
      {/* Canvas area */}
      <div className="flex-1" style={{ marginRight: selectedNode ? 480 : 0, transition: "margin-right 0.2s ease-out" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={1.5}
          attributionPosition="bottom-left"
          proOptions={{ hideAttribution: true }}
          defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
        >
          <Background color={rfTheme.background} gap={20} />
          <Controls
            className="[&>button]:!bg-zinc-900 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-800"
            position="bottom-left"
          />
          <MiniMap
            nodeColor={(n) => {
              const d = n.data as unknown as CanvasNodeData | undefined
              if (d?.status === "complete") return "#166534"
              if (d?.status === "ready") return "#1e40af"
              if (d?.status === "stale") return "#92400e"
              if (d?.status === "error") return "#991b1b"
              return "#27272a"
            }}
            maskColor={rfTheme.minimapMask}
            style={{ background: "#18181b" }}
          />
        </ReactFlow>
      </div>

      {/* Side panel */}
      {selectedNode && selectedNodeData && (
        <SidePanel
          nodeId={selectedNode.id}
          nodeData={selectedNodeData}
          runId={runId}
          onClose={() => setSelectedNodeId(null)}
          onRefresh={refresh}
        />
      )}
    </div>
  )
}
