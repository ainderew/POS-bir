
"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface HeatmapData {
  day_of_week: number // 0 (Sun) - 6 (Sat)
  hour_of_day: number // 0 - 23
  volume: number
}

interface SalesHeatmapProps {
  data: HeatmapData[]
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 8 AM to 8 PM (Simplify for retail hours)

export function SalesHeatmap({ data }: SalesHeatmapProps) {
  // Normalize volume for opacity
  const maxVolume = Math.max(...data.map(d => d.volume), 1)

  const getVolume = (day: number, hour: number) => {
    return data.find(d => d.day_of_week === day && d.hour_of_day === hour)?.volume || 0
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Peak Hour Heatmap</CardTitle>
            <CardDescription>
              Identify high-traffic periods for better staff scheduling.
            </CardDescription>
          </div>
          <span className="text-[10px] bg-muted px-2 py-1 rounded font-medium text-muted-foreground whitespace-nowrap">
            Last 30 Days Trend
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-[0px] p-4">
        <div className="h-full w-full overflow-auto">
          <div className="min-w-[600px] h-full flex flex-col">
            {/* Header Row */}
            <div className="flex mb-3">
              <div className="w-14" /> {/* Spacer */}
              {HOURS.map(hour => (
                <div key={hour} className="flex-1 text-center text-[10px] font-medium text-muted-foreground">
                  {hour > 12 ? hour - 12 : hour}{hour >= 12 ? 'p' : 'a'}
                </div>
              ))}
            </div>

            {/* Grid Rows */}
            <div className="flex-1 flex flex-col justify-between min-h-0">
              {DAYS.map((dayName, dayIndex) => (
                <div key={dayName} className="flex items-center flex-1 py-0.5">
                  <div className="w-14 text-[11px] font-semibold text-muted-foreground">
                    {dayName}
                  </div>
                  <div className="flex-1 flex gap-1 h-full">
                    {HOURS.map(hour => {
                      const vol = getVolume(dayIndex, hour)
                      const intensity = vol / maxVolume
                      return (
                        <div
                          key={`${dayIndex}-${hour}`}
                          className="flex-1 h-full rounded-sm transition-all hover:scale-105 relative group min-h-[24px]"
                          style={{
                            backgroundColor: `rgba(34, 197, 94, ${intensity || 0.05})` // Green base
                          }}
                        >
                          <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-black text-white text-[9px] px-1 py-0.5 rounded pointer-events-none whitespace-nowrap z-10">
                            {vol} sales
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
