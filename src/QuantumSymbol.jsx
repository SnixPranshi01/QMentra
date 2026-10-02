import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const orbitColors = [0x00f0ff, 0xff007a, 0x9d4edd]

function QuantumSymbol() {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    let frameId = 0
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 12)
    camera.position.z = 4.1

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x0a0e1a, 0)
    mount.appendChild(renderer.domElement)

    const core = new THREE.Group()
    scene.add(core)
    scene.add(new THREE.AmbientLight(0xffffff, 1.5))

    const nucleus = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff }),
    )
    core.add(nucleus)

    const nucleusGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 24, 20),
      new THREE.MeshBasicMaterial({ color: 0x9d4edd, transparent: true, opacity: 0.15, depthWrite: false }),
    )
    core.add(nucleusGlow)

    const orbits = orbitColors.map((color, index) => {
      const orbit = new THREE.Group()
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.86, 0.012, 10, 140),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82 }),
      )
      orbit.add(ring)

      const electron = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 18, 14),
        new THREE.MeshBasicMaterial({ color }),
      )
      electron.position.set(0.86, 0, 0)
      orbit.add(electron)

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.095, 16, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }),
      )
      glow.position.copy(electron.position)
      orbit.add(glow)
      orbit.rotation.set(index * 0.88 + 0.34, index * 0.73 + 0.2, index * 0.52)
      core.add(orbit)
      return { orbit, speed: index % 2 ? -1 : 1 }
    })

    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    })
    resizeObserver.observe(mount)

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const clock = new THREE.Clock()
    const render = () => {
      const elapsed = clock.getElapsedTime()
      core.rotation.y = Math.sin(elapsed * 0.22) * 0.12
      core.rotation.x = Math.cos(elapsed * 0.18) * 0.08
      nucleusGlow.scale.setScalar(1 + Math.sin(elapsed * 2.1) * 0.07)
      orbits.forEach(({ orbit, speed }, index) => {
        orbit.rotation.z += speed * (0.0028 + index * 0.00035)
      })
      renderer.render(scene, camera)
      if (!reducedMotion) frameId = window.requestAnimationFrame(render)
    }
    render()

    return () => {
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose()
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => material.dispose())
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div className="quantum-symbol" ref={mountRef} role="img" aria-label="Three-dimensional quantum atom with cyan, magenta, and violet electron orbits" />
}

export default QuantumSymbol