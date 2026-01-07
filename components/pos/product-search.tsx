"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Search, Loader2 } from "lucide-react"
import type { Product } from "@/lib/types"
import { toast } from "sonner"

interface ProductSearchProps {
  onProductSelect: (product: Product) => void
  searchTerm?: string
  onSearchChange?: (value: string) => void
}

export function ProductSearch({ onProductSelect, searchTerm: externalSearchTerm, onSearchChange }: ProductSearchProps) {
  const [internalSearchTerm, setInternalSearchTerm] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const barcodeBufferRef = useRef("")
  const lastKeystrokeRef = useRef(Date.now())

  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm
  const setSearchTerm = onSearchChange || setInternalSearchTerm

  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus()

    // Handle barcode scanner input (rapid keyboard entries ending with Enter)
    const handleKeyPress = (e: KeyboardEvent) => {
      const currentTime = Date.now()
      const timeSinceLastKey = currentTime - lastKeystrokeRef.current
      lastKeystrokeRef.current = currentTime

      // If rapid input (< 50ms between keys), likely a barcode scanner
      if (timeSinceLastKey < 50) {
        if (e.key === "Enter") {
          // Search by barcode
          searchByBarcode(barcodeBufferRef.current)
          barcodeBufferRef.current = ""
        } else if (e.key.length === 1) {
          barcodeBufferRef.current += e.key
        }
      } else {
        barcodeBufferRef.current = e.key.length === 1 ? e.key : ""
      }
    }

    window.addEventListener("keypress", handleKeyPress)
    return () => window.removeEventListener("keypress", handleKeyPress)
  }, [])

  const searchByBarcode = async (barcode: string) => {
    if (!barcode) return

    setIsSearching(true)
    try {
      const response = await fetch(`/api/products/barcode/${encodeURIComponent(barcode)}`)

      if (response.ok) {
        const product = await response.json()
        onProductSelect(product)
        setSearchTerm("")
      } else {
        toast.error(`Product not found: ${barcode}`)
      }
    } catch (error) {
      toast.error("Error searching for product")
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearch = async (value: string) => {
    setSearchTerm(value)

    if (!value) return

    // Check if it's a barcode (numeric and longer than 8 chars)
    if (/^\d{8,}$/.test(value)) {
      await searchByBarcode(value)
      return
    }

    // Otherwise search by name
    setIsSearching(true)
    try {
      const response = await fetch(`/api/products?search=${encodeURIComponent(value)}`)
      const products = await response.json()

      if (products.length === 1) {
        onProductSelect(products[0])
        setSearchTerm("")
      } else if (products.length === 0) {
        toast.error("Product not found")
      } else {
        toast.info(`Found ${products.length} products. Please be more specific.`)
      }
    } catch (error) {
      toast.error("Error searching for product")
    } finally {
      setIsSearching(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSearch(searchTerm)
    }
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
      <Input
        ref={inputRef}
        placeholder="Scan barcode or search product..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyDown={handleKeyDown}
        className="pl-10 pr-10 h-12 text-lg"
        autoFocus
      />
      {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin" />}
    </div>
  )
}
