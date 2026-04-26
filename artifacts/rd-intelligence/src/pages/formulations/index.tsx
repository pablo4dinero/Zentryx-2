import { useListFormulations } from "@workspace/api-client-react";
import { PageLoader } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Plus, TestTube, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";

export default function Formulations() {
  const { data: formulations, isLoading } = useListFormulations({});

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Formulations Database</h1>
          <p className="text-muted-foreground mt-1">Manage recipes, ingredients, and sensory profiles.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search recipes..." className="pl-9" />
          </div>
          <Button className="gap-2"><Plus className="w-4 h-4" /> New Recipe</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {formulations?.map(form => {
          
          // Format sensory data for radar chart if it exists
          const radarData = form.sensoryScores ? [
            { subject: 'Taste', A: form.sensoryScores.taste, fullMark: 10 },
            { subject: 'Texture', A: form.sensoryScores.texture, fullMark: 10 },
            { subject: 'Aroma', A: form.sensoryScores.aroma, fullMark: 10 },
            { subject: 'Visual', A: form.sensoryScores.appearance, fullMark: 10 },
            { subject: 'Overall', A: form.sensoryScores.overall, fullMark: 10 },
          ] : [];

          return (
            <div key={form.id} className="glass-card rounded-2xl p-6 flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <TestTube className="w-5 h-5 text-primary" />
                  <h3 className="text-xl font-bold font-display text-foreground">{form.name}</h3>
                </div>
                <Badge variant={form.status === 'approved' ? 'success' : form.status === 'rejected' ? 'destructive' : 'secondary'} className="uppercase text-[10px]">
                  {form.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-6 font-mono border border-white/10 px-2 py-1 rounded bg-black/20 w-fit">v{form.version}</p>
              
              <div className="grid grid-cols-2 gap-4 flex-1">
                {/* Ingredients summary */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Ingredients</h4>
                  <ul className="space-y-1.5">
                    {form.ingredients.slice(0, 4).map((ing, i) => (
                      <li key={i} className="flex justify-between text-sm">
                        <span className="text-foreground line-clamp-1 pr-2">{ing.name}</span>
                        <span className="text-muted-foreground font-mono">{ing.percentage}%</span>
                      </li>
                    ))}
                    {form.ingredients.length > 4 && (
                      <li className="text-xs text-primary pt-1">+{form.ingredients.length - 4} more</li>
                    )}
                  </ul>
                </div>

                {/* Radar Chart Thumbnail */}
                {radarData.length > 0 ? (
                  <div className="h-32 w-full relative">
                     <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                          <PolarGrid stroke="rgba(255,255,255,0.1)" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                          <Radar name="Score" dataKey="A" stroke="hsl(252, 89%, 65%)" fill="hsl(252, 89%, 65%)" fillOpacity={0.4} />
                        </RadarChart>
                      </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-32 w-full flex flex-col items-center justify-center border border-dashed border-white/10 rounded-xl text-muted-foreground">
                    <AlertTriangle className="w-5 h-5 mb-2 opacity-50" />
                    <span className="text-xs">No Sensory Data</span>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex justify-between items-center text-sm">
                <div className="text-muted-foreground">Cost: <span className="text-foreground font-mono">${form.costPerUnit || '?.??'}/u</span></div>
                <Button variant="ghost" size="sm" className="h-8">View Details</Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
}
