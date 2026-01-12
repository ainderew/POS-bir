"use client"

import { useState, useEffect } from "react"
import { User as UserIcon, Loader2 } from "lucide-react"
import type { User } from "@/lib/types"

interface UserGridProps {
  onSelectUser: (user: User) => void
}

export function UserGrid({ onSelectUser }: UserGridProps) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users')
      if (!res.ok) {
        throw new Error('Failed to fetch users')
      }
      const data = await res.json()
      setUsers(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-red-500/10 text-red-700 border-red-500/20'
      case 'MANAGER':
        return 'bg-blue-500/10 text-blue-700 border-blue-500/20'
      case 'CASHIER':
        return 'bg-green-500/10 text-green-700 border-green-500/20'
      default:
        return 'bg-gray-500/10 text-gray-700 border-gray-500/20'
    }
  }

  const getInitials = (fullName: string) => {
    return fullName
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center text-red-600">
          <p className="font-semibold">Error loading users</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center text-gray-500">
          <UserIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="font-semibold">No active users found</p>
          <p className="text-sm">Please contact your administrator</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Who's Working Today?</h2>
        <p className="text-gray-600">Select your profile to continue</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((user) => (
          <button
            key={user.id}
            onClick={() => onSelectUser(user)}
            className="group relative p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-primary hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            {/* Avatar Circle */}
            <div className="flex flex-col items-center space-y-3">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                <span className="text-2xl font-bold text-primary">
                  {getInitials(user.full_name)}
                </span>
              </div>

              {/* User Name */}
              <div className="text-center">
                <p className="font-semibold text-lg">{user.full_name}</p>
              </div>

              {/* Role Badge */}
              <div className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>
                {user.role}
              </div>
            </div>

            {/* Hover Indicator */}
            <div className="absolute inset-0 rounded-xl border-2 border-primary opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </button>
        ))}
      </div>
    </div>
  )
}
