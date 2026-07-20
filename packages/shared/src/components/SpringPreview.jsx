import { createSignal } from "solid-js";

const springs = [
  { name: "Meadow Hot Springs", state: "Utah", stateCode: "ut", temp: "102°F", access: "Easy walk-in", tag: "Popular" },
  { name: "Arizona Hot Springs", state: "Arizona", stateCode: "az", temp: "106°F", access: "3.2 mi hike", tag: "Iconic" },
  { name: "Kyle Hot Springs", state: "Nevada", stateCode: "nv", temp: "108°F", access: "High clearance", tag: "Remote" },
  { name: "Gandy Warm Springs", state: "Utah", stateCode: "ut", temp: "87°F", access: "Roadside", tag: "Free" },
  { name: "Ringbolt Hot Springs", state: "Arizona", stateCode: "az", temp: "98°F", access: "Boat or hike", tag: "Wild" },
  { name: "Soldier Meadows", state: "Nevada", stateCode: "nv", temp: "100°F", access: "4WD advised", tag: "Remote" },
];

export default function SpringPreview() {
  const [activeFilter, setActiveFilter] = createSignal("All");
  
  const filters = ["All", "Utah", "Nevada", "Arizona"];
  const filtered = () => activeFilter() === "All" ? springs : springs.filter(s => s.state === activeFilter());

  const dotColor = (state) => {
    if (state === "Utah") return "#4A8F6A";
    if (state === "Nevada") return "#7A6A4A";
    return "#B85A00";
  };

  const navigateToDirectory = (stateCode) => {
    const stateName = stateCode === 'ut' ? 'Utah' : stateCode === 'nv' ? 'Nevada' : 'Arizona';
    window.location.href = `/directory?state=${stateName}`;
  };

  const navigateToDirectoryFromFilter = (stateName) => {
    window.location.href = `/directory?state=${stateName}`;
  };

  return (
    <div>
      <div class="flex justify-center gap-1 mb-5">
        {filters.map(f => (
          <button
            class={`px-3 py-1 text-xs tracking-wider rounded-sm border ${
              activeFilter() === f
                ? "bg-ds-text text-ds-background border-ds-text"
                : "bg-transparent text-ds-text border-ds-text border-opacity-30 hover:bg-ds-background"
            }`}
            onClick={() => {
              setActiveFilter(f);
              if (f !== "All") {
                navigateToDirectoryFromFilter(f);
              }
            }}
          >{f}</button>
        ))}
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        {filtered().map((s, i) => (
          <div class="bg-ds-background border border-ds-text border-opacity-20 p-4 rounded-sm">
            <div class="flex justify-between items-start mb-2">
              <div class="font-display text-sm font-bold text-ds-text leading-tight">
                {s.name}
              </div>
              <span class="text-xs px-2 py-1 bg-ds-background border border-ds-text border-opacity-20 text-ds-text whitespace-nowrap">
                {s.tag}
              </span>
            </div>
            <div class="flex gap-3 text-xs text-ds-text opacity-80">
              <span 
                class="flex items-center cursor-pointer hover:opacity-100 hover:text-ds-button transition-colors"
                onClick={() => navigateToDirectory(s.stateCode)}
              >
                <span class="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: dotColor(s.state) }}></span>
                {s.state}
              </span>
              <span>{s.temp}</span>
              <span>{s.access}</span>
            </div>
          </div>
        ))}
      </div>
      <div class="text-center mt-6">
        <p class="text-xs text-ds-text opacity-60">
          Preview only. <a href="/directory" class="text-ds-button hover:opacity-80 transition-opacity">View full directory →</a>
        </p>
      </div>
    </div>
  );
}