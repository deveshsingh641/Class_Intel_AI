import { useState } from "react";
import { Search, Filter, X, Calendar, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AdvancedSearchProps {
  onSearch: (filters: SearchFilters) => void;
  departments?: string[];
  className?: string;
}

export interface SearchFilters {
  query: string;
  department: string;
  minRating: number;
  maxRating: number;
  minFeedback: number;
  sortBy: string;
  dateRange: "all" | "week" | "month" | "year";
}

export function AdvancedSearch({ onSearch, departments = [], className }: AdvancedSearchProps) {
  const [filters, setFilters] = useState<SearchFilters>({
    query: "",
    department: "all",
    minRating: 0,
    maxRating: 5,
    minFeedback: 0,
    sortBy: "rating-desc",
    dateRange: "all",
  });
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const handleFilterChange = (key: keyof SearchFilters, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onSearch(newFilters);
  };

  const clearFilters = () => {
    const defaultFilters: SearchFilters = {
      query: "",
      department: "all",
      minRating: 0,
      maxRating: 5,
      minFeedback: 0,
      sortBy: "rating-desc",
      dateRange: "all",
    };
    setFilters(defaultFilters);
    onSearch(defaultFilters);
  };

  const activeFiltersCount = [
    filters.department !== "all",
    filters.minRating > 0,
    filters.maxRating < 5,
    filters.minFeedback > 0,
    filters.dateRange !== "all",
  ].filter(Boolean).length;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Main Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search teachers by name, subject, or department..."
            value={filters.query}
            onChange={(e) => handleFilterChange("query", e.target.value)}
            className="pl-10 h-10"
          />
        </div>
        <Popover open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="relative h-10">
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Advanced Filters</h4>
                    {activeFiltersCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="h-8 text-xs"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>

                  {/* Department Filter */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Department
                    </Label>
                    <Select
                      value={filters.department}
                      onValueChange={(value) => handleFilterChange("department", value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Departments</SelectItem>
                        {departments.map((dept) => (
                          <SelectItem key={dept} value={dept}>
                            {dept}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Rating Range */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      Rating Range
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        placeholder="Min"
                        value={filters.minRating || ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          handleFilterChange("minRating", isNaN(val) ? 0 : Math.max(0, Math.min(5, val)));
                        }}
                        className="w-20"
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        placeholder="Max"
                        value={filters.maxRating || ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          handleFilterChange("maxRating", isNaN(val) ? 5 : Math.max(0, Math.min(5, val)));
                        }}
                        className="w-20"
                      />
                    </div>
                  </div>

                  {/* Minimum Feedback Count */}
                  <div className="space-y-2">
                    <Label>Minimum Feedback Count</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={filters.minFeedback || ""}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        handleFilterChange("minFeedback", isNaN(val) ? 0 : Math.max(0, val));
                      }}
                    />
                  </div>

                  {/* Date Range */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Time Period
                    </Label>
                    <Select
                      value={filters.dateRange}
                      onValueChange={(value) => handleFilterChange("dateRange", value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Time</SelectItem>
                        <SelectItem value="week">Last Week</SelectItem>
                        <SelectItem value="month">Last Month</SelectItem>
                        <SelectItem value="year">Last Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sort By */}
                  <div className="space-y-2">
                    <Label>Sort By</Label>
                    <Select
                      value={filters.sortBy}
                      onValueChange={(value) => handleFilterChange("sortBy", value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rating-desc">Highest Rating</SelectItem>
                        <SelectItem value="rating-asc">Lowest Rating</SelectItem>
                        <SelectItem value="feedback-desc">Most Feedback</SelectItem>
                        <SelectItem value="feedback-asc">Least Feedback</SelectItem>
                        <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                        <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.department !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Department: {filters.department}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => handleFilterChange("department", "all")}
              />
            </Badge>
          )}
          {(filters.minRating > 0 || filters.maxRating < 5) && (
            <Badge variant="secondary" className="gap-1">
              Rating: {filters.minRating}-{filters.maxRating}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => {
                  handleFilterChange("minRating", 0);
                  handleFilterChange("maxRating", 5);
                }}
              />
            </Badge>
          )}
          {filters.minFeedback > 0 && (
            <Badge variant="secondary" className="gap-1">
              Min Feedback: {filters.minFeedback}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => handleFilterChange("minFeedback", 0)}
              />
            </Badge>
          )}
          {filters.dateRange !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {filters.dateRange.charAt(0).toUpperCase() + filters.dateRange.slice(1)}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => handleFilterChange("dateRange", "all")}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

