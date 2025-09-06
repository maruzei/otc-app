import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, SafeAreaView, Alert, ScrollView, TouchableOpacity, Button, Dimensions } from 'react-native';
import { GestureDetector, Gesture, Directions } from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

const STORAGE_KEY = '@golf_score_card';

// サウンドファイルのパス (仮)
const CLICK_SOUND = require('./assets/click.mp3');
const CONFIRM_SOUND = require('./assets/confirm.mp3');

export default function App() {
  const [hole, setHole] = useState(1);
  const [stroke, setStroke] = useState(0);
  const [scores, setScores] = useState(Array(18).fill(null));
  const [highestReachedHole, setHighestReachedHole] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [roundFinished, setRoundFinished] = useState(false); // 新しい状態変数
  const scrollViewRef = useRef(null);

  // サウンドオブジェクトのref
  const clickSoundRef = useRef(null);
  const confirmSoundRef = useRef(null);

  // --- Sound Loading ---
  useEffect(() => {
    const loadSounds = async () => {
      try {
        console.log('Attempting to load click sound...');
        const { sound: clickSoundInstance } = await Audio.Sound.createAsync(CLICK_SOUND);
        clickSoundRef.current = clickSoundInstance;
        console.log('Click sound loaded:', clickSoundInstance);

        console.log('Attempting to load confirm sound...');
        const { sound: confirmSoundInstance } = await Audio.Sound.createAsync(CONFIRM_SOUND);
        confirmSoundRef.current = confirmSoundInstance;
        console.log('Confirm sound loaded:', confirmSoundInstance);

      } catch (error) {
        console.error('Error loading sounds:', error);
      }
    };

    loadSounds();

    // アンマウント時にサウンドをアンロード
    return () => {
      if (clickSoundRef.current) {
        clickSoundRef.current.unloadAsync();
      }
      if (confirmSoundRef.current) {
        confirmSoundRef.current.unloadAsync();
      }
    };
  }, []);

  // --- Data Persistence Hooks ---
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedData = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedData !== null) {
          const { savedHole, savedStroke, savedScores, savedHighestReachedHole, savedRoundFinished } = JSON.parse(savedData);
          setHole(savedHole);
          setStroke(savedStroke);
          setScores(savedScores);
          setHighestReachedHole(savedHighestReachedHole || 1);
          setRoundFinished(savedRoundFinished || false);
        }
      } catch (e) {
        Alert.alert("エラー", "データの読み込みに失敗しました。");
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      const saveData = async () => {
        try {
          const data = {
            savedHole: hole,
            savedStroke: stroke,
            savedScores: scores,
            savedHighestReachedHole: highestReachedHole,
            savedRoundFinished: roundFinished,
          };
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
          Alert.alert("エラー", "データの保存に失敗しました。");
        }
      };
      saveData();
    }
  }, [hole, stroke, scores, highestReachedHole, roundFinished, isLoaded]);

  // --- Scroll to current hole ---
  useEffect(() => {
    if (scrollViewRef.current && isLoaded && !roundFinished) {
      // Calculate the width of a single score card including margins
      const cardWidth = 60 + (5 * 2); // width + horizontal margins

      // Calculate the index of the current hole (0-indexed)
      const currentIndex = hole - 1;

      // Calculate the offset to center the current card
      // (currentIndex * cardWidth) is the start position of the card
      // - (Dimensions.get('window').width / 2) moves the start of the card to the center of the screen
      // + (cardWidth / 2) adjusts to center the card itself
      const offset = (currentIndex * cardWidth) - (Dimensions.get('window').width / 2) + (cardWidth / 2);

      scrollViewRef.current.scrollTo({
        x: offset,
        animated: true,
      });
    }
  }, [hole, isLoaded, roundFinished]); // Re-run when hole, isLoaded, or roundFinished changes

  // --- Core Functions ---
  const handleSelectHole = (selectedHole) => {
    if (roundFinished) { // ラウンド結果画面からのタップ
      setRoundFinished(false); // ゲーム画面に戻る
      setHole(selectedHole);
      setStroke(scores[selectedHole - 1] || 0);
      return;
    }
    if (selectedHole === hole) return; // Do nothing if current hole is tapped
    if (selectedHole > 18) return; // Prevent selecting beyond 18 holes

    // Feedback for tapping scorecard
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (clickSoundRef.current) clickSoundRef.current.replayAsync();

    Alert.alert(
      "スコア修正",
      `ホール${selectedHole}のスコアを修正しますか？`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "OK",
          onPress: () => {
            setHole(selectedHole);
            setStroke(scores[selectedHole - 1] || 0);
          },
        },
      ]
    );
  };

  const goToNextHole = () => {
    const newScores = [...scores];
    newScores[hole - 1] = stroke;
    setScores(newScores);

    // Always update highestReachedHole if we are advancing from the current highest or a skipped hole
    // This handles the 18th hole case correctly
    if (hole >= highestReachedHole) { // Update if we are at or past the leading edge
        setHighestReachedHole(hole + 1);
    }

    // Feedback for confirming hole
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (confirmSoundRef.current) confirmSoundRef.current.replayAsync();

    if (hole < 18) { // Only advance hole and set stroke if not the 18th hole
      const nextHole = hole + 1;
      setHole(nextHole);
      setStroke(scores[hole] || 0); // This will be scores[nextHole-1]
    } else {
      // Round is finished (hole is 18)
      Alert.alert("ラウンド終了", "18ホールお疲れ様でした！");
      setRoundFinished(true); // ラウンド終了状態に設定
    }
  };

  const handleReset = () => {
    Alert.alert(
      "スコアをリセット",
      "本当にすべてのスコアをリセットしますか？この操作は元に戻せません。",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "リセット",
          onPress: () => {
            Alert.alert(
              "最終確認",
              "最終確認: 本当にリセットしますか？",
              [
                { text: "キャンセル", style: "cancel" },
                {
                  text: "すべてリセット",
                  onPress: async () => {
                    setHole(1);
                    setStroke(0);
                    setScores(Array(18).fill(null));
                    setHighestReachedHole(1);
                    setRoundFinished(false); // リセット時はラウンド終了状態を解除
                    try {
                      await AsyncStorage.removeItem(STORAGE_KEY);
                      Alert.alert("リセット完了", "すべてのスコアがリセットされました。");
                    } catch (e) {
                      Alert.alert("エラー", "リセットに失敗しました。");
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };
  
  // --- Gestures ---
  const flingRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => {
      if (roundFinished) return; // ラウンド終了後は操作不可
      if (hole <= 18) { // Only allow stroke changes up to 18th hole
        setStroke(s => s + 1);
        // Feedback for +1 stroke
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (clickSoundRef.current) clickSoundRef.current.replayAsync();
      }
    });

  const flingLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => {
      if (roundFinished) return; // ラウンド終了後は操作不可
      if (hole <= 18) { // Only allow stroke changes up to 18th hole
        if (stroke > 0) {
          setStroke(s => s - 1);
          // Feedback for -1 stroke
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (clickSoundRef.current) clickSoundRef.current.replayAsync();
        } else {
          Alert.alert("打数エラー", "打数は0未満にできません。");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); // Error feedback
        }
      }
    });

  const flingUp = Gesture.Fling()
    .direction(Directions.UP)
    .onEnd(() => {
      if (roundFinished) return; // ラウンド終了後は操作不可
      if (hole > 18) return; // Prevent confirming beyond 18 holes

      const saveCurrentScore = () => {
        const newScores = [...scores];
        newScores[hole - 1] = stroke;
        setScores(newScores);
      };

      if (hole >= highestReachedHole) {
        // Normal play: confirm and go to next hole
        Alert.alert(
          "ホール確定",
          `ホール${hole}のスコアは ${stroke} です。確定して次のホールへ進みますか？`,
          [
            { text: "キャンセル", style: "cancel" },
            { text: "OK", onPress: () => goToNextHole() },
          ]
        );
      } else {
        // Editing a past hole: confirm and return to highestReachedHole
        Alert.alert(
          "修正完了",
          `ホール${hole}のスコアを ${stroke} に修正します。よろしいですか？`,
          [
            { text: "キャンセル", style: "cancel" },
            {
              text: "OK",
              onPress: () => {
                saveCurrentScore();
                if (hole >= highestReachedHole) {
                    setHighestReachedHole(hole + 1);
                }
                // Feedback for confirming modification
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                if (confirmSoundRef.current) confirmSoundRef.current.replayAsync();
              },
            },
          ]
        );
      }
    });
    
  const composedGesture = Gesture.Race(flingRight, flingLeft, flingUp);

  if (!isLoaded) {
    return null;
  }

  // --- Render ---
  console.log('Render: Hole', hole, 'Stroke', stroke); // 追加したログ
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={composedGesture}>
        <SafeAreaView style={styles.container}>
                      <View style={styles.header}>
            {roundFinished ? null : <Text style={styles.headerText}>Hole: {hole}</Text>}
            {/* Button to return to result screen */}
            {!roundFinished && hole !== highestReachedHole && (
              <TouchableOpacity style={styles.customButton} onPress={() => {
                if (stroke === (scores[hole - 1] || 0)) {
                  setRoundFinished(true);
                  return;
                }
                Alert.alert(
                  "修正完了",
                  `ホール${hole}のスコアを ${stroke} に修正します。よろしいですか？`,
                  [
                    { text: "キャンセル", style: "cancel" },
                    {
                      text: "OK",
                      onPress: () => {
                        const newScores = [...scores];
                        newScores[hole - 1] = stroke;
                        setScores(newScores);
                        if (hole >= highestReachedHole) {
                            setHighestReachedHole(hole + 1);
                        }
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        if (confirmSoundRef.current) confirmSoundRef.current.replayAsync();
                        setRoundFinished(true);
                      },
                    },
                  ]
                );
              }}>
                <Text style={styles.customButtonText}>結果へ戻る</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.customButton} onPress={handleReset}>
              <Text style={styles.customButtonText}>Reset</Text>
            </TouchableOpacity>
          </View>
          {roundFinished ? (
            <ScrollView contentContainerStyle={styles.summaryContainer}>
              {/* Calculate totals outside the JSX for clarity */}
              {(() => {
                const total18HoleScore = scores.reduce((sum, s) => sum + (s || 0), 0);
                const totalH1_H9 = scores.slice(0, 9).reduce((sum, s) => sum + (s || 0), 0);
                const totalH10_H18 = scores.slice(9, 18).reduce((sum, s) => sum + (s || 0), 0);

                // Helper to render a cell
                const renderCell = (holeNumber, score, isTotal = false) => (
                  <TouchableOpacity
                    key={`H${holeNumber}`}
                    style={isTotal ? [styles.gridCell, styles.finalizedCard] : styles.gridCell}
                    onPress={() => {
                      if (!isTotal) {
                        handleSelectHole(holeNumber);
                      }
                    }}
                  >
                    {!isTotal && <Text style={styles.gridHoleText}>H{holeNumber}</Text>}
                    <Text style={[styles.gridScoreText, isTotal && styles.finalizedText]}>
                      {score === null ? '-' : score}
                    </Text>
                  </TouchableOpacity>
                );

                return (
                  <>
                    <Text style={styles.totalScoreBaseText}>
                      <Text style={styles.totalScoreZ}>{total18HoleScore}</Text>
                      {` = ${totalH1_H9} + ${totalH10_H18}`}
                    </Text>
                    <View style={styles.resultsGridWithLabels}>
                      <View style={styles.gridLabelContainer}>
                        <Text style={styles.gridLabel}>OUT</Text>
                        <Text style={styles.gridLabel}>IN</Text>
                      </View>
                      <View style={styles.scoreGridContainer}>
                        {/* Front 9 */}
                        <View style={styles.scoreGroup}>
                          <View style={styles.scoreColumn}>
                            {renderCell(1, scores[0])}
                            {renderCell(2, scores[1])}
                            {renderCell(3, scores[2])}
                            {renderCell(4, scores[3])}
                            {renderCell(5, scores[4])}
                          </View>
                          <View style={styles.scoreColumn}>
                            {renderCell(6, scores[5])}
                            {renderCell(7, scores[6])}
                            {renderCell(8, scores[7])}
                            {renderCell(9, scores[8])}
                            {renderCell('H1-9計', totalH1_H9, true)}
                          </View>
                        </View>

                        {/* Back 9 */}
                        <View style={styles.scoreGroup}>
                          <View style={styles.scoreColumn}>
                            {renderCell(10, scores[9])}
                            {renderCell(11, scores[10])}
                            {renderCell(12, scores[11])}
                            {renderCell(13, scores[12])}
                            {renderCell(14, scores[13])}
                          </View>
                          <View style={styles.scoreColumn}>
                            {renderCell(15, scores[14])}
                            {renderCell(16, scores[15])}
                            {renderCell(17, scores[16])}
                            {renderCell(18, scores[17])}
                            {renderCell('H10-18計', totalH10_H18, true)}
                          </View>
                        </View>
                      </View>
                    </View>
                    <Text style={styles.editHintText}>
                      各ホールのスコアをタップして修正できます
                    </Text>
                  </>
                );
              })()}
            </ScrollView>
          ) : (
            <>
              <View style={styles.mainContent}>
                <Text style={styles.strokeCount}>{stroke}</Text>
              </View>
              <View style={styles.footer}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.scoreCardContainer}
                  ref={scrollViewRef}
                >
                  {scores.map((score, index) => {
                    const holeNumber = index + 1;
                    const isCurrentActiveHole = hole === holeNumber;
                    const isHolePlayed = score !== null;

                    const showFinalizedStyle = isHolePlayed;
                    const showCurrentStyle = isCurrentActiveHole;

                    return (
                      <TouchableOpacity key={index} onPress={() => handleSelectHole(holeNumber)}>
                        <View style={[
                          styles.scoreCard,
                          showCurrentStyle && styles.currentHoleCard,
                          showFinalizedStyle && styles.finalizedCard
                        ]}>
                          <Text style={[
                            styles.holeText,
                            showFinalizedStyle && styles.finalizedText
                          ]}>H{holeNumber}</Text>
                          <Text style={[
                            styles.scoreText,
                            showFinalizedStyle && styles.finalizedText
                          ]}>{isCurrentActiveHole ? stroke : (score === null ? '-' : score)}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </>
          )}
        </SafeAreaView>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    color: '#000000',
    fontSize: 32,
    fontWeight: 'bold',
  },
  mainContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strokeCount: {
    color: '#000000',
    fontSize: 200,
    fontWeight: 'bold',
  },
  footer: {
    paddingVertical: 20,
    backgroundColor: '#f0f0f0',
  },
  scoreCardContainer: {
    paddingHorizontal: 10,
  },
  scoreCard: {
    width: 60,
    height: 80,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#cccccc',
  },
  currentHoleCard: {
    borderColor: '#006600',
  },
  finalizedCard: {
    backgroundColor: '#000000',
  },
  holeText: {
    color: '#000000',
    fontSize: 16,
  },
  scoreText: {
    color: '#000000',
    fontSize: 28,
    fontWeight: 'bold',
  },
  finalizedText: {
    color: '#FFFFFF',
  },
  summaryContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  totalScoreBaseText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 20,
  },
  totalScoreZ: {
    fontSize: 54,
    fontWeight: 'bold',
  },
  resultsGridWithLabels: {
    width: '100%',
    maxWidth: 420,
  },
  gridLabelContainer: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  gridLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
  },
  scoreGridContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
  },
  scoreGroup: {
    flexDirection: 'row',
    borderWidth: 2,
    borderColor: '#000000',
  },
  scoreHalf: {
    flexDirection: 'row',
  },
  scoreColumn: {
    flexDirection: 'column',
  },
  gridCell: {
    width: 80,
    height: 70,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  gridHoleText: {
    fontSize: 12,
    color: '#888888',
    position: 'absolute',
    top: 2,
    left: 2,
  },
  gridScoreText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#000000',
  },
  editHintText: {
    fontSize: 12,
    color: '#888888',
    marginTop: 20,
    textAlign: 'center',
  },
  customButton: {
    borderWidth: 1,
    borderColor: '#000000',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  customButtonText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
});