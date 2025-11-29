import {
  Button,
  ButtonGroup,
  Editable,
  EditableInput,
  EditablePreview,
  Heading,
  HStack,
  Box,
  Collapse,
  Text,
  Badge,
} from "@chakra-ui/react";
import axios from "axios";
import {
  Suspense,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import {
  FiArrowLeft,
  FiArrowRight,
  FiChevronDown,
  FiChevronRight,
} from "react-icons/fi";
import { useQuery } from "react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { QueryStatus } from "../components/common/QueryStatus";
import { SongTable } from "../components/data/SongTable";
import { DEFAULT_FETCH_CONFIG } from "../modules/services/defaults";
import { useSongAPI } from "../modules/services/songs.service";
import { useSongQueuer } from "../utils/SongQueuerHook";
const PERPAGE = 10;
export default function ChannelSongs() {
  const { t } = useTranslation();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const channelId = params.id!;

  const { data: channel, ...channelStatus } = useQuery(
    ["channel", channelId],
    async (q) => {
      return (await axios.get("/api/v2/channels/" + q.queryKey[1])).data;
    },
    { ...DEFAULT_FETCH_CONFIG, cacheTime: 600000 /* 10 mins */ },
  );

  const [offset, setOffset] = useState(
    Math.max((Number(searchParams.get("page")) - 1) * PERPAGE, 0),
  );
  const { data, ...songStatus } = useSongAPI({
    channel_id: channelId,
    paginated: true,
    limit: PERPAGE,
    offset: offset,
  });

  const { items: latest, total } = useMemo(
    () => (data as any) || { items: undefined, total: 0 },
    [data],
  );

  const { data: allSongsData } = useSongAPI({
    channel_id: channelId,
    paginated: true,
    limit: total,
    offset: 0,
  });

  const allSongs = useMemo(
    () => (allSongsData as any)?.items || [],
    [allSongsData],
  );

  const normalizeSongName = (name: string): string => {
    let normalized = name;

    // Normalize full-width and half-width characters FIRST
    // Convert full-width alphanumeric to half-width
    normalized = normalized.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => {
      return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
    });

    // Convert to lowercase
    normalized = normalized.toLowerCase();

    // Remove content in brackets/parentheses (including Japanese brackets)
    normalized = normalized.replace(
      /\s*[\(\[\{（【〔［｛].*?[\)\]\}）】〕］｝]/g,
      "",
    );

    // Remove romanization after slash (common pattern: "日本語 / romaji")
    normalized = normalized.replace(/\s*[\/／]\s*.*/g, "");

    // Remove featured artists (English and Japanese) - remove space requirement before pattern
    normalized = normalized.replace(
      /\s*(feat\.?|ft\.?|featuring|with|×|x).*/gi,
      "",
    );

    // Remove common video/audio markers (English and Japanese)
    normalized = normalized.replace(
      /\s*[-–—]\s*(official|music|video|mv|audio|lyric|lyrics|ver\.?|version)/gi,
      "",
    );
    normalized = normalized.replace(
      /\s+(official|music|video|mv|audio|lyric|lyrics|ver\.?|version)$/gi,
      "",
    );

    // Normalize quotes and apostrophes (including Japanese)
    normalized = normalized.replace(/["""]/g, '"').replace(/[''']/g, "'");
    normalized = normalized.replace(/[「」『』]/g, "");

    // Normalize full-width spaces to regular spaces
    normalized = normalized.replace(/\u3000/g, " ");

    // Remove ALL spaces between Japanese characters (CJK)
    // This handles cases where spacing differs between versions
    normalized = normalized.replace(
      /([ぁ-んァ-ヶー一-龯])\s+(?=[ぁ-んァ-ヶー一-龯])/g,
      "$1",
    );

    // Normalize remaining whitespace
    normalized = normalized.replace(/\s+/g, " ");

    // Normalize dashes (including Japanese/full-width)
    normalized = normalized.replace(/\s*[-–—ー〜～]\s*/g, "");

    // Remove leading/trailing whitespace and common punctuation
    normalized = normalized.trim();
    normalized = normalized.replace(
      /^[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+/,
      "",
    );
    normalized = normalized.replace(
      /[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$/,
      "",
    );

    return normalized;
  };

  const songNameCounts = useMemo(() => {
    const counts: Record<
      string,
      {
        count: number;
        originalNames: string[];
        normalizedName: string;
        songs: any[];
      }
    > = {};
    if (Array.isArray(allSongs)) {
      allSongs.forEach((song: any) => {
        const originalName = song?.name || song?.title || "Unknown";
        const normalizedName = normalizeSongName(originalName);

        if (!counts[normalizedName]) {
          counts[normalizedName] = {
            count: 0,
            originalNames: [],
            normalizedName,
            songs: [],
          };
        }
        counts[normalizedName].count += 1;
        if (!counts[normalizedName].originalNames.includes(originalName)) {
          counts[normalizedName].originalNames.push(originalName);
        }
        counts[normalizedName].songs.push(song);
      });
    }
    return counts;
  }, [allSongs]);

  const sortedSongNameCounts = useMemo(() => {
    return Object.entries(songNameCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([, data]) => ({
        normalizedName: data.normalizedName,
        count: data.count,
        originalNames: data.originalNames,
        songs: data.songs,
      }));
  }, [songNameCounts]);

  const hasLoggedRef = useRef(false);

  useEffect(() => {
    if (
      allSongs.length > 0 &&
      sortedSongNameCounts.length > 0 &&
      !hasLoggedRef.current
    ) {
      console.log("All songs (total: " + total + "):", allSongs);
      console.log("Song name counts (sorted):", sortedSongNameCounts);
      hasLoggedRef.current = true;
    }
  }, [allSongs, sortedSongNameCounts, total]);

  const onPageChange = useCallback(
    (nextOffset: number) => {
      setOffset(nextOffset);
      searchParams.set("page", (nextOffset / PERPAGE + 1).toString());
      setSearchParams(searchParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const [commonOffset, setCommonOffset] = useState(0);
  const [expandedSongs, setExpandedSongs] = useState<Set<string>>(new Set());

  const commonSongsPage = useMemo(() => {
    return sortedSongNameCounts.slice(commonOffset, commonOffset + PERPAGE);
  }, [sortedSongNameCounts, commonOffset]);

  const toggleSongExpansion = useCallback((normalizedName: string) => {
    setExpandedSongs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(normalizedName)) {
        newSet.delete(normalizedName);
      } else {
        newSet.add(normalizedName);
      }
      return newSet;
    });
  }, []);

  const onCommonPageChange = useCallback((nextOffset: number) => {
    setCommonOffset(nextOffset);
    setExpandedSongs(new Set());
  }, []);

  const queueSongs = useSongQueuer();
  const navigate = useNavigate();

  if (!channelStatus.isSuccess)
    return <QueryStatus queryStatus={channelStatus} />;
  if (songStatus.isLoading) return <QueryStatus queryStatus={songStatus} />;

  return (
    <>
      <HStack alignItems="center" py={1}>
        <Button
          variant="solid"
          width="22px"
          height="22px"
          size="30px"
          borderRadius="full"
          position="relative"
          as="a"
          href={"/channel/" + channel.id}
          onClick={(e) => {
            e.preventDefault();
            navigate("/channel/" + channel.id);
          }}
        >
          <FiArrowLeft />
        </Button>
        <Heading size="md">
          {t("All Songs")}{" "}
          {t("({{ from }} - {{ to }} of {{ total }})", {
            from: offset + 1,
            to: offset + latest.length,
            total,
          })}
        </Heading>
        <Button
          variant="ghost"
          size="sm"
          py={0}
          colorScheme="n2"
          onClick={() => {
            queueSongs({ songs: latest, immediatelyPlay: false });
          }}
        >
          {t("Queue ({{amount}})", { amount: latest.length })}
        </Button>
      </HStack>
      <Suspense fallback={<div>{t("Loading...")}</div>}>
        <SongTable songs={latest} rowProps={{ indexShift: offset }}></SongTable>
      </Suspense>
      <ButtonGroup colorScheme="brand" mt="3" spacing="5">
        <Button
          onClick={() =>
            onPageChange(
              Math.max(
                Math.min(
                  Math.floor(total / PERPAGE) * PERPAGE,
                  offset - PERPAGE,
                ),
                0,
              ),
            )
          }
          disabled={offset === 0}
        >
          <FiArrowLeft />
        </Button>
        <Editable
          key={offset}
          defaultValue={String(Math.floor(offset / PERPAGE) + 1)}
          fontSize="xl"
          onSubmit={(e) => {
            const n = Number.parseInt(e);
            onPageChange(
              Math.max(
                Math.min(
                  Math.floor(total / PERPAGE) * PERPAGE,
                  (n - 1) * PERPAGE,
                ),
                0,
              ),
            );
          }}
        >
          <EditablePreview />
          <EditableInput
            width="30px"
            type="number"
            min="1"
            max={Math.ceil(total / PERPAGE)}
          />
        </Editable>
        <Button
          onClick={() =>
            onPageChange(
              Math.max(
                Math.min(
                  Math.floor(total / PERPAGE) * PERPAGE,
                  offset + PERPAGE,
                ),
                0,
              ),
            )
          }
          disabled={offset + PERPAGE > total}
        >
          <FiArrowRight />
        </Button>
      </ButtonGroup>

      <HStack alignItems="center" py={1} mt={8}>
        <Heading size="md">
          {t("Most Common Songs")}{" "}
          {t("({{ from }} - {{ to }} of {{ total }})", {
            from: commonOffset + 1,
            to: commonOffset + commonSongsPage.length,
            total: sortedSongNameCounts.length,
          })}
        </Heading>
      </HStack>
      <Box>
        {commonSongsPage.map((songGroup, index) => {
          const isExpanded = expandedSongs.has(songGroup.normalizedName);
          const displayName = songGroup.originalNames[0];

          return (
            <Box key={songGroup.normalizedName} mb={2}>
              <Button
                width="100%"
                justifyContent="space-between"
                onClick={() => toggleSongExpansion(songGroup.normalizedName)}
                variant="ghost"
                height="auto"
                py={2}
                px={3}
                _hover={{ bg: "whiteAlpha.100" }}
              >
                <HStack spacing={3} flex={1}>
                  <Box>
                    {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                  </Box>
                  <Text fontSize="sm" color="gray.500" minWidth="30px">
                    {commonOffset + index + 1}
                  </Text>
                  <Text flex={1} textAlign="left" fontWeight="medium">
                    {displayName}
                  </Text>
                  <Badge colorScheme="blue" fontSize="sm">
                    {songGroup.count}{" "}
                    {songGroup.count === 1 ? t("time") : t("times")}
                  </Badge>
                </HStack>
              </Button>
              <Collapse in={isExpanded} animateOpacity>
                <Box pl={4} mt={2}>
                  <Suspense fallback={<div>{t("Loading...")}</div>}>
                    <SongTable songs={songGroup.songs} />
                  </Suspense>
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>
      <ButtonGroup colorScheme="brand" mt="3" spacing="5">
        <Button
          onClick={() =>
            onCommonPageChange(
              Math.max(
                Math.min(
                  Math.floor(sortedSongNameCounts.length / PERPAGE) * PERPAGE,
                  commonOffset - PERPAGE,
                ),
                0,
              ),
            )
          }
          disabled={commonOffset === 0}
        >
          <FiArrowLeft />
        </Button>
        <Editable
          key={commonOffset}
          defaultValue={String(Math.floor(commonOffset / PERPAGE) + 1)}
          fontSize="xl"
          onSubmit={(e) => {
            const n = Number.parseInt(e);
            onCommonPageChange(
              Math.max(
                Math.min(
                  Math.floor(sortedSongNameCounts.length / PERPAGE) * PERPAGE,
                  (n - 1) * PERPAGE,
                ),
                0,
              ),
            );
          }}
        >
          <EditablePreview />
          <EditableInput
            width="30px"
            type="number"
            min="1"
            max={Math.ceil(sortedSongNameCounts.length / PERPAGE)}
          />
        </Editable>
        <Button
          onClick={() =>
            onCommonPageChange(
              Math.max(
                Math.min(
                  Math.floor(sortedSongNameCounts.length / PERPAGE) * PERPAGE,
                  commonOffset + PERPAGE,
                ),
                0,
              ),
            )
          }
          disabled={commonOffset + PERPAGE > sortedSongNameCounts.length}
        >
          <FiArrowRight />
        </Button>
      </ButtonGroup>
    </>
  );
}
